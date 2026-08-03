package com.tucker.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

/**
 * What [OpenApiSnapshotTest] reads its verdict off, specified on its own.
 *
 * The guard is only as useful as the sentence it fails with — a developer who has
 * changed a DTO needs to see *what* moved, not a wall of consequences. These fix the
 * two ways that sentence can mislead: naming a difference that is not one, and
 * naming one difference several times over.
 */
class SpecDifferencesTest {

    private val objectMapper = ObjectMapper()

    @Test
    fun `a name added to a list of required fields is reported once, not once per name it displaced`() {
        val committed = spec("""{"schemas":{"Version":{"required":["builtAt","gitSha","version"]}}}""")
        val served = spec("""{"schemas":{"Version":{"required":["builtAt","driftProbe","gitSha","version"]}}}""")

        assertEquals(
            listOf(
                """.schemas.Version.required: committed ["builtAt","gitSha","version"], """ +
                    """served ["builtAt","driftProbe","gitSha","version"]""",
            ),
            specDifferences(committed, served),
        )
    }

    @Test
    fun `a list of required fields naming the same fields in a different order is not a difference`() {
        val committed = spec("""{"schemas":{"Version":{"required":["builtAt","gitSha","version"]}}}""")
        val served = spec("""{"schemas":{"Version":{"required":["version","builtAt","gitSha"]}}}""")

        assertEquals(emptyList(), specDifferences(committed, served))
    }

    @Test
    fun `a member whose value is an empty object is compared, not dropped from both sides`() {
        val committed = spec("""{"schemas":{"Version":{"properties":{}}}}""")
        val served = spec("""{"schemas":{"Version":{}}}""")

        assertEquals(
            listOf(
                ".schemas.Version: committed absent, served {}",
                ".schemas.Version.properties: committed {}, served absent",
            ),
            specDifferences(committed, served),
        )
    }

    @Test
    fun `an object whose values are all scalars is compared field by field, not as one list`() {
        val committed = spec("""{"info":{"title":"OpenAPI definition","version":"v0"}}""")
        val served = spec("""{"info":{"title":"Tucker","version":"v0"}}""")

        assertEquals(
            listOf(""".info.title: committed "OpenAPI definition", served "Tucker""""),
            specDifferences(committed, served),
        )
    }

    /**
     * A path key carrying a `.` reads, once joined, exactly like one more level of
     * nesting. Keyed by the joined string the two share an entry, the later one wins,
     * and a change under the earlier one is answered with silence.
     */
    @Test
    fun `a change under a key containing a dot is reported, not swallowed by a path that reads the same`() {
        val committed = spec("""{"paths":{"/api/spec.json":{"get":{"x":1}},"/api/spec":{"json":{"get":{"x":2}}}}}""")
        val served = spec("""{"paths":{"/api/spec.json":{"get":{"x":7}},"/api/spec":{"json":{"get":{"x":2}}}}}""")

        assertEquals(
            listOf(".paths./api/spec.json.get.x: committed 1, served 7"),
            specDifferences(committed, served),
        )
    }

    private fun spec(json: String) = objectMapper.readTree(json)
}
