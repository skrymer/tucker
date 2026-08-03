package com.tucker.api

import com.fasterxml.jackson.databind.JsonNode

/**
 * Every leaf two OpenAPI documents disagree on, one line each, sorted.
 *
 * The two are built by two different runs — the committed one by the springdoc
 * Gradle plugin's forked `bootRun`, the served one by the test's own context — and
 * nothing makes two JVMs enumerate controllers and schemas in the same order. JSON
 * object key order carries no meaning, so a textual diff would be free to go red
 * over a document that says exactly the same thing. Addressing every value by its
 * path takes sibling order out of the comparison, and names a difference as the one
 * place it occurs rather than as two 88 KB documents.
 *
 * `spring-boot-starter-test` puts JSONAssert on the classpath, and it is passed over
 * here deliberately: in `NON_EXTENSIBLE` mode an added array member reports only
 * "Expected 3 values but got 4", with `fieldMissing` and `fieldUnexpected` both
 * empty, so the name that was added is neither printed nor recoverable — and adding
 * a field to a DTO is the likeliest drift there is. `STRICT` does name it, but by
 * re-reporting every member after it as displaced.
 */
internal fun specDifferences(committed: JsonNode, served: JsonNode): List<String> {
    val committedLeaves = committed.contractLeaves()
    val servedLeaves = served.contractLeaves()

    return (committedLeaves.keys + servedLeaves.keys)
        .filter { committedLeaves[it] != servedLeaves[it] }
        .sortedBy { it.render() }
        .map { "${it.render()}: committed ${committedLeaves[it] ?: "absent"}, served ${servedLeaves[it] ?: "absent"}" }
}

/**
 * A leaf is keyed by its segments rather than by those segments joined, so that two
 * different places can never key the same entry and hide one of them. Joining first
 * would collide `{"a.b": {"c": …}}` with `{"a": {"b": {"c": …}}}`, and the survivor
 * of `toMap` is whichever came last — deciding by key order, the one thing this
 * comparison exists to be immune to. No key in the spec carries a `.` or a bracket
 * today; `produces = "application/vnd.tucker.v1+json"` or a `@Schema(name = "Foo.Bar")`
 * is all it would take. They still *render* alike, but both are reported.
 */
private fun List<String>.render() = joinToString("")

/**
 * The document's leaves, less `servers` — which records the address the spec
 * happened to be generated from, port 8181 for `generateOpenApiDocs`' forked
 * `bootRun` and plain `localhost` for MockMvc, rather than anything the API
 * promises. Nothing reads it: `openFetch` sets no `baseURL`, and the app calls
 * `/api` same-origin through the nitro proxy (ADR 0015).
 */
private fun JsonNode.contractLeaves(): Map<List<String>, String> {
    require(isObject) { "An OpenAPI document is a JSON object; this one is $nodeType." }
    return properties()
        .filterNot { it.key == "servers" }
        .flatMap { (name, child) -> child.leaves(listOf(".$name")) }
        .toMap()
}

/**
 * Flattens to `path -> rendered value`.
 *
 * `isEmpty` is true of every scalar and of `{}` and `[]` alike — exactly the nodes
 * that render as themselves. Empty containers have to be leaves in their own right:
 * a member whose value is `{}` otherwise contributes nothing, and a member that is
 * only ever empty would then be missing from *both* sides and read as unchanged.
 *
 * An array of scalars is one leaf rather than one per index, because every array
 * OpenAPI writes as scalars — `required`, `enum`, operation-level `tags` — is a set.
 * Addressing those by index reports one added name as a difference at every position
 * it displaced, which reads as a rename that never happened, and goes red over a
 * reordering that means nothing; so the leaf holds the members, sorted. The cost is
 * that a genuine reordering stops being reported, which is what a set wants and is
 * harmless for `enum`, whose generated TypeScript union does not care.
 *
 * Arrays of objects keep their index — not because OpenAPI orders them (`allOf` is a
 * conjunction and `parameters` a set; neither is order-sensitive) but because
 * objects cannot be put in a canonical order without inventing a key for them. An
 * index is the conservative choice: it can report a reordering that changes nothing,
 * and it cannot miss a change that does.
 */
private fun JsonNode.leaves(path: List<String>): List<Pair<List<String>, String>> = when {
    isEmpty -> listOf(path to toString())

    isObject -> properties().flatMap { (name, child) -> child.leaves(path + ".$name") }

    isArray && all { it.isValueNode } ->
        listOf(path to map { it.toString() }.sorted().joinToString(",", "[", "]"))

    else -> flatMapIndexed { index, child -> child.leaves(path + "[$index]") }
}
