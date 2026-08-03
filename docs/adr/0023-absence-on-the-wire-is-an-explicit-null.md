# Absence on the wire is an explicit null, and the spec says so

Tucker's DTOs are Kotlin data classes, and the ones describing a value the
backend may not have use nullable types — `paceStatus: String?`,
`calorieBudget: Double?`, `cookedWeightG: Double?`. There is no
`@JsonInclude(NON_NULL)` anywhere and no `default-property-inclusion` setting, so
Jackson's default applies: those fields are serialized as explicit `null`s. A
client always receives the key.

The generated OpenAPI spec did not say that. springdoc infers "not required" from
Kotlin nullability and stops there, so the spec marked **46 properties across 29
schemas non-required and not one of them nullable**. `nuxt-open-fetch` turned
that into `paceStatus?: string` — `string | undefined` — for a field whose wire
value is `string | null`.

Nothing was broken by it, because every consumer happened to use `??` or a falsy
check, which treat the two alike. It would break the first time someone wrote
`=== undefined`, `in`, `Object.keys`, or a Zod schema against one of the 46 — all
of which distinguish them, and none of which the types would flag. It had already
cost fidelity once: when the typecheck gate went in
([#200](https://github.com/skrymer/tucker/issues/200)), several component
fixtures carried the `null` the API really sends, the generated types rejected
them, and the pragmatic fix was to change the *fixtures* to `undefined` — making
them typecheck while describing a payload the backend never produces.

## The fork, and why it was settled by measurement

Two directions, both defensible on their face:

1. **Make the spec tell the truth** — emit `nullable: true` for Kotlin-nullable
   fields, regenerate the client, and handle `| null` wherever these are read.
2. **Make the wire match the spec** — set
   `spring.jackson.default-property-inclusion: non_null` so absent fields are
   omitted rather than sent as null. One config line, and the existing generated
   types become correct as they stand.

Which one ripples further was a guess on both sides, so both were built and
measured before choosing:

| | spec truthful? | `pnpm typecheck` | `./gradlew test` |
|---|---|---|---|
| before | no — 46 wrong | 0 errors | green |
| make the spec truthful | **46/46** | **0 errors** | **green** |
| `default-property-inclusion: non_null` | yes, by omitting | 0 errors | **8 failures** |

Option 1 costs nothing. Widening a read type from `T | undefined` to
`T | null | undefined` breaks no existing consumer, because the consumers were
already absence-tolerant — that is exactly why the bug was latent. The fixtures
#200 had to falsify go back to `null` and still typecheck.

Option 2 breaks eight backend tests, and *what* they assert is the argument
against it. They are not incidental:

```kotlin
jsonPath("$.dayStatus") { value(null) }
assertTrue(foodRow.get("ingredientCount").isNull, "a plain Food carries no ingredient count")
```

The suite already deliberately pins these fields as present-and-null. Omitting
them would not merely spend the "field absent" vs "field explicitly null"
distinction for every future client — it would delete a contract this codebase
wrote tests to hold down. That distinction is cheap to keep and expensive to get
back, and nothing was asking for it to be spent.

**Decision: make the spec tell the truth.** The wire format is unchanged.

## The spec is derived from the Kotlin types, not annotated alongside them

springdoc has no setting for this. Its Kotlin support only corrects `required` on
request *parameters*, and swagger-core's `ModelResolver.resolveNullable` reads
exactly one thing — an explicit `@Schema(nullable = true)`. Neither JSR-305
`@Nullable` nor the `org.jetbrains.annotations.Nullable` the Kotlin compiler
already emits has any effect. springdoc's `PropertyCustomizer` hook cannot help
either: it is handed empty `ctxAnnotations`, so those annotations never reach it.

That left annotating 46 fields by hand, or deriving the fact from where it was
already declared. We derive it: `OpenApiNullabilityConfig` registers a
`ModelConverter` that reads `KProperty.returnType.isMarkedNullable` off the
Kotlin class and marks the matching schema property nullable.

Annotating would have put the same fact in two places — the type and the
annotation — with nothing keeping them in step. A new nullable field would be
correct in Kotlin and silently wrong in the spec, which is the failure this ADR
exists to end. Deriving it means new DTO fields are described correctly the day
they are written, and the count never has to be audited again.

There is a shorter route that was considered and rejected. springdoc has already
read the same Kotlin nullability to decide `required`, so the converter could
mark every non-required property nullable and skip reflection entirely — the two
sets are identical today, all 46 of them. It is rejected because the first guard
below asserts exactly that identity. Deriving the spec from `required` would make
that test a tautology: it would pass by construction and could never fail, which
costs the drift detection this whole change exists to install. The redundancy is
the point — two independent derivations of one fact, and a test that fails when
they disagree.

Two details the implementation is pinned to:

- **The spec stays OpenAPI 3.0.1.** 3.1 was tried, since it permits `$ref`
  siblings and would have been the tidy fix for nullable references. It is worse:
  swagger drops `nullable` entirely (it is not a 3.1 keyword) and emits no
  replacement, taking the count from 43 back to **0**.
- **Nullable references are wrapped in `allOf`.** OAS 3.0 ignores every sibling
  of a `$ref`, so `nullable: true` beside one is silently discarded. That is the
  whole gap between 43 and 46 — `BarcodeLookupResponse.food` and `.candidate`,
  and `DailySummaryResponse.budgetChange`. The standard wrap makes them
  round-trip, and `openapi-typescript` renders them `FoodResponse | null`.
- **Nullable enums list `null` as a value.** Added with
  [#215](https://github.com/skrymer/tucker/issues/215), which typed
  `dayStatus`/`driftStatus`/`paceStatus` as their domain enums. `enum` is the
  stricter keyword — it admits exactly what it lists, and `nullable` beside it
  adds nothing — so `{"nullable": true, "enum": ["on-target", …]}` forbids the
  `null` the same schema declares legal, on the API's most common response.
  Appending `null` to the list resolves it. `openapi-typescript` already derived
  the `| null` arm from `nullable`, so the generated client does not move; this
  is for every *other* reader of the spec — a linter, a mock server, a
  second-language generator — which would otherwise flag the pre-review day.

## What holds it in place

`OpenApiNullabilityTest` guards both halves, and neither test catches the other's
drift:

- Every optional field in the live spec is marked nullable. Fails if the
  converter is removed or stops covering a case. It asserts the spec fetch
  returned 200 and found schemas first, because an empty spec would otherwise
  satisfy the check vacuously.
- A nullable reference is wrapped in `allOf` and carries no bare `$ref`. Without
  it that branch is exercised only by the coincidence that three fields happen to
  be nullable refs today; flatten those and the wrap could rot unnoticed until
  the next one silently lost its `nullable`.
- A nullable enum lists `null`. Same reasoning one keyword over, and it carries
  the same floor: it asserts a nullable enum exists at all first, so the check
  cannot pass vacuously once the last one is flattened.
- A response carries every field its schema declares, even the ones it has no
  value for. Fails if inclusion is ever switched to `non_null` — verified by
  temporarily doing so, which fails this test while the first one still passes.

## What it does not do

Regenerating the spec (`./gradlew generateOpenApiDocs` → `pnpm exec nuxt
prepare`) yields `paceStatus?: string | null` — that is `T | null | undefined`,
**not** `T | null`. Only the `nullable` axis moved; `required` did not. So the
type still carries an `undefined` arm the API cannot produce, and
`summary.dayStatus === undefined` still compiles.

Closing that would mean marking these fields `required` as well, and the spec has
no room to do it selectively: springdoc emits one schema per class, the converter
cannot tell whether it is resolving a request or a response, and eight of the 29
schemas are request DTOs whose nullable fields may legitimately be omitted —
`CreateFoodRequest.barcode`, `LogEstimatedEntryRequest.protein`,
`SaveWeightRequest.clientToday`. `ProfileDto` is literally both the GET response
and the PUT body. Forcing callers to send an explicit `null` to satisfy
`required` would be a real regression, so **"optional" still means two different
things on the two sides of the spec**, and this ADR narrows the wrong one only.

Three further boundaries, none of which any current DTO crosses:

- **Only top-level properties.** `val tags: List<String?>` has
  `isMarkedNullable == false`, so the element type is untouched and the same lie
  recurs one level down — with no test to catch it, since the guard walks
  `properties` only.
- **Names are matched as declared.** The converter looks properties up by Kotlin
  property name, so a field renamed with `@JsonProperty` would be skipped. That
  fails loudly rather than silently — the field lands non-required and
  not-nullable, which is exactly what the first test rejects — but the message
  points at the DTO, not at the rename, so the message says so.
- **A composed schema would fail *silently*, which none of the others do.** Given
  `@Schema(allOf = …)` on a DTO class, swagger moves the model's properties into
  an `allOf` item and leaves `properties` null *before* registering it, so the
  converter finds nothing to mark — and the first test reads the same missing
  `properties` node, so it passes vacuously rather than complaining. No DTO
  composes its schema today. Anything that starts to must re-check both halves
  here, because neither will say a word.

A fourth boundary stood here and no longer does. The *derivation* was automatic,
but getting it into `frontend/openapi/tucker.json` — what the client types are
generated from — was the two-command step in CLAUDE.md with nothing checking the
snapshot against the backend, so a new nullable field could be correct in the
served spec and absent from the client with every test green.
`OpenApiSnapshotTest` closes that (issue #209): it compares the two on every
build and fails naming both the differing paths and the commands that regenerate
them. It compares parsed JSON by path rather than as text, because the two
documents come from two different JVM runs and nothing makes those enumerate
schemas in the same order; and it excludes `servers`, which records the address
the spec was generated from rather than anything the API promises.

It replaces that boundary with a narrower one of its own, recorded on the test:
the committed copy is generated from `src/main/resources/application.yml` while
the test reads a context built from `src/test/resources/application.yml`, which
**shadows** it. Both springdoc keys in main are spec-neutral today, which is the
only reason the two agree; a spec-affecting one added to main would turn this
guard red against a snapshot that is right about production, and the answer then
is to make the contexts agree — never to edit the snapshot to match the test.

## Consequences

Every nullable field added after these 46 is described correctly the day it is
written, without anyone auditing a count — which matters most for F10, where five
rounds of regeneration land on these schemas as ownership scoping is added.

The wire format did not change, so no client needs redeploying in step, and
nothing about `Cf-Access-Jwt-Assertion`, 401s, or 404s is affected.
