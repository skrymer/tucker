# Known survivors

Every mutant a full sweep leaves alive, with the verdict already reached for it.
Triage the survivors a *change* introduces; check them against this list first, and
only re-litigate an entry if the code under it moved.

The four verdicts are the skill's: **real gap**, **killed by an out-of-scope
layer**, **equivalent mutant**, **false survivor**. A fifth label appears here —
**noise** — for a mutant of the compiler's work rather than Tucker's, which is the
same category the `avoidCallsTo` and `$$inlined$` filters in
`backend/build.gradle.kts` already handle structurally.

Established by closing [#239](https://github.com/skrymer/tucker/issues/239) (backend)
and [#237](https://github.com/skrymer/tucker/issues/237) (frontend).

## Where the score stands

Backend, whole sweep (`TZ=Etc/UTC ./gradlew mutationTest`, ~17 min):

| package | unkilled / total | before |
| --- | --- | --- |
| `persistence` | 27/146 | 30/148 |
| `provider` | 22/69 | 25/69 |
| `api` | 12/226 | 22/226 |
| `domain` | 8/411 | 38/411 |
| `service` | 6/90 | 8/92 |
| `config` | 3/23 | 23/23 |
| `security` | 3/46 | 31/71 |
| **all** | **81/1011 — 92%** | 180/1043 — 83% |

Frontend, `app/utils/` (`pnpm exec stryker run --mutate "app/utils/exits.ts,app/utils/navigation.ts,app/utils/numberField.ts,app/utils/reviewLedger.ts"`, ~1 min):

| file | score | before |
| --- | --- | --- |
| `exits.ts` | 100.00 | 60.00 |
| `numberField.ts` | 100.00 | 75.00 |
| `navigation.ts` | 86.49 | 72.97 |
| `reviewLedger.ts` | 85.00 | 85.00 |
| **all** | **89.74** | 75.64 |

`security` and `config` moved most because 28 mutants left `--targetClasses` and two
new test classes made 43 of the rest killable; `domain` moved because 30 boundary
mutants got the tests they were owed.

---

## Frontend — StrykerJS

`app/utils/`, 8 survivors, all one cluster.

### Presentation tokens (8) — accepted, deliberately unasserted

| Where | Mutants |
| --- | --- |
| `navigation.ts` — every `navDestinations` `icon` → `""` | 5 |
| `reviewLedger.ts` — every `REVIEW_BASIS_BADGE` `color` → `""` | 3 |

**Verdict: real gap, accepted by decision.** They are killable, and a test that
kills one pins the token (`i-lucide-house`, `primary`) rather than a rule — so it
would fail whenever a designer deliberately changed an icon, which is not a
regression. What actually matters is structural and already enforced: the
`NavDestination` type requires an icon, and `REVIEW_BASIS_BADGE`'s `Record<ReviewBasis, …>`
key type requires an entry for every basis, so no basis can go unlabelled. The
notes live at the top of `navigation.test.ts` and `reviewLedger.test.ts`.

Everything else in `app/utils/` is at 100%: `exits.ts` and `numberField.ts` outright,
`navigation.ts` and `reviewLedger.ts` apart from the tokens above. `date.ts` is at
100% including `localYesterday`'s month/year rollback.

### `components/DateField.vue` — 3 of 30

| Where | Mutant | Verdict |
| --- | --- | --- |
| the model setter's `if (!value) return` | `if (false) return` | **Equivalent** |
| `valueId`'s `id.value ?? fallbackId` | `??` → `&&` | **Equivalent** |
| the malformed-date `console.warn` text | text → `""` | **Accepted** |

A single-date `UCalendar` has no gesture that clears its own value — re-tapping the
selected day is inert — so the setter is never called with `undefined` and the arm
is unreachable. It exists because the writable computed's type is
`CalendarDate | undefined`, not because a deselect is expected. Confirmed by hand:
deleting the guard outright leaves the whole suite green. `prevent-deselect` was
tried here and dropped for the same reason — it changed nothing observable.

`valueId` is the only producer of that id, and both consumers — the `sr-only` span's
`:id` and the `aria-describedby` — read the same computed. Whatever string it yields
the two agree, so the link holds and no mutant of the fallback is observable.

*That* the malformed branch warns is pinned; *what it says* is not, because asserting
log prose makes the test fail on a reworded message rather than on a defect.

### `components/ProfileForm.vue` — 2 of 46

| Where | Mutant | Verdict |
| --- | --- | --- |
| `sexItems` — each radio's `label` → `""` | 2 | **Accepted, as above** |

Same class as the presentation tokens: with a blank `label` the radio's accessible
name falls back to its `value` (`MALE`), so it stays findable and operable and the
only loss is the display casing. The two `value`s — the figures that actually reach
`PUT /api/profile` — *are* pinned, one test per sex.

`components/LogWeightSheet.vue`'s remaining survivors are all in the re-seed
`watch(() => props.open)`. **Pre-existing and untriaged** — #241 only swapped its
date control. Its `'Pick a date'` survivor was **removed at the source** instead:
`measuredOn` is seeded from `date`/`today` and can only be changed by a picker
that is bounded to today and cannot clear itself, so a required-ness or range
rule there is a message nothing can ever show. The field is deliberately
unconstrained, and says so — unlike `ProfileForm`'s birth date, whose Zod rule
stays reachable on an API-supplied value.

---

## Backend — pitest

### Excluded from `--targetClasses` (28) — false survivors the tool cannot see

Not survivors any more; listed because the exclusion is the thing to re-check if
one of these classes gains real logic. Reasoning and hand-mutation evidence are in
`backend/build.gradle.kts` beside the flag.

| Class | Was | Settled by |
| --- | --- | --- |
| `security.AccessSecurityConfig` (+ nested) | 22/22 unkilled | deleting the authorize rule fails 142 tests |
| `security.AccessProperties` | 3/3 unkilled | blanking `audience` at its one call site fails 150 tests |
| `TuckerApplicationKt` | 3/3 uncovered | `main()` + a JVM DNS property; only `./gradlew e2eTest` boots it |

The mechanism is pitest's: it selects tests by **line** coverage, and a line that
runs once while the first test class builds the application context is attributed to
whichever test happened to trigger it, never to the tests that observe the result.

### `config.KotlinNullableModelConverter` — 3 of 23

`schemaBehind` L75, three `NegateConditionalsMutator` on the `$ref` → `definedModels`
lookup.

**Verdict: false survivor.** Replacing the whole lookup with `resolved` fails 4 tests
(`OpenApiNullabilityTest` ×3, `OpenApiSnapshotTest`), so the branch is load-bearing.
`KotlinNullableModelConverterTest` drives the converter on its own swagger chain and
kills the other 20; it does not reproduce springdoc's resolution order, which is
where a Kotlin type first comes back as an already-registered `$ref`. springdoc
caches the built spec, so no test that reads the spec can see a mutation of the
converter either — which is why the class scored 0/23 before that test existed.

### `security.AccessJwtDecoderKt` — 3 of 14

| Line | Mutant | Verdict |
| --- | --- | --- |
| 76, 77 | `remoteSetDecoder`'s `jwsKeySelector` / claims verifier removed | **Killed by an out-of-scope layer — and none exists.** `AccessJwtDecoderTest` builds this decoder but deliberately never decodes with it: Nimbus fetches the JWKS lazily, and asserting more would mean reaching Cloudflare over the network from a unit test. The identical `localSetDecoder` shape is exercised by ~180 tests. |
| 89 | `localSetDecoder`'s `setJWTClaimsSetVerifier { _, _ -> }` removed | **Equivalent mutant.** Verified: the whole suite passes without it. Nimbus's default verifier only re-checks `exp`, which Spring's validators already reject on. The line states the division of labour (claims are Spring's job) and guards against a future Nimbus default; today it changes no outcome. |

### `persistence.OwnerEmailPlaceholderConfig` — 1 of 1

L39, `if (raw != null)` inside the `@Bean`'s `FlywayConfigurationCustomizer`.

**Verdict: false survivor**, same startup mechanism as the excluded three. Left in
`--targetClasses` because its neighbour `sqlLiteralSafe` — the escaping that actually
matters — is real logic and fully killed; excluding the file would hide that too.

### `provider.OpenFoodFactsProvider` — 22 of 69

**The DNS pre-warm (10)** — `prewarmDns` L100–102, `resolveHostUntilWarm` L107–119.

**Verdict: killed by no layer, and correctly so.** Best-effort startup mitigation,
run off-thread, whose failure is explicitly harmless — a real lookup still falls
through gracefully. Its only observable effect is the latency of the *first* scan
after boot, which no test layer can see, and giving it a seam to count resolution
attempts would test the seam. Recorded rather than pinned.

**The retry caps (3)** — `lookupByBarcode` L133, `canRetry` L159 ×2.

**Verdict: equivalent mutant.** The loop bound and `canRetry`'s `attempt >= MAX_ATTEMPTS - 1`
are deliberate belt-and-braces: whichever one is mutated, the other still stops the
loop after 3 attempts. Mutating L133 changes nothing; mutating either L159 mutant
costs one extra 250 ms backoff before the loop ends on its own bound, and nothing
but an upper timing bound could see that. The suite uses a slack *lower* bound on
purpose (see `minimumRetryDelay`), because upper bounds on wall-clock flake.

**The budget's exact edge (1)** — `canRetry` L160 `<=` → `<`.

**Verdict: equivalent mutant in practice.** Differs only when elapsed-plus-backoff
equals the retry deadline to the nanosecond, on a wall clock. The arithmetic either
side of it is pinned: *a retry that could not even finish its own backoff is not
attempted* kills the `+` → `-` mutant, and two more tests pin the deadline itself.

**Log-message construction (7)** — `canRetry` L161, L164; `ask` L194, L195 ×3;
`readCandidate` L238.

**Verdict: noise.** `--avoidCallsTo` stops pitest mutating the `log.warn(…)` *call*,
but not the arguments it builds or the branch that picks between "retrying" and
"no verdict reached". Every one of these changes only what a log line says. The
return values beside them are all killed.

**`requestFactory` L310 — `setConnectTimeout` removed (1).**

**Verdict: killed by no layer.** The read timeout is pinned (*a Provider too slow to
answer…*); the connect timeout's red needs a **blackholed** address, so that connect
hangs rather than being refused, and no CI network guarantees one — a firewall that
sends RST would make the test pass for the wrong reason.

### `domain` — 8 of 411

The package the engine is most worth running on, and the one with the least left.

**`@JsonValue` wire-value accessors (3)** — `DriftStatus.getValue` L14,
`PaceStatus.getValue` L10, `DayStatus.getValue` L21, each `→ ""`, all reported
NO_COVERAGE.

**Verdict: false survivor.** Blanking all four `DriftStatus` values by hand fails 4
tests (`OpenApiDiscriminatorTest`, `OpenApiSnapshotTest`, `SummaryApiTest` ×2). The
three are the same shape and Jackson reads them the same way; pitest records no
coverage because the values are read during serialization and spec-building, which
happen inside a cached application context. **This is the startup-caching mechanism
reaching past Spring configuration into ordinary domain enums** — worth knowing,
because the class here looks nothing like a `@Bean`.

**Entity id accessors (4)** — `WeighedEntry.getId`, `WeeklyReview.getId`,
`PushSubscription.getId`, `Pace.getGPer100Kcal`.

**Verdict: real gap, accepted by decision** — the same category as the `api` DTO
accessors below.

**`WeightTrend.from` L70 (1)** — `throwIndexOverflow` removed.

**Verdict: noise.** The overflow guard Kotlin compiles into `forEachIndexed`;
reaching it needs more than 2³¹ measurements. Not filtered, because the only
available filter is `avoidCallsTo kotlin.collections.CollectionsKt`, which would also
silence `sortedBy`, `sumOf` and every other collection call in the codebase.

### `api` — 12 of 226

DTO accessors on `GoalResponse` (3), `WeeklyReviewResponse` (3), `FoodResponse` (2),
`GoalProgressResponse` (2), `DailySummaryResponse` (1), `EntryResponse.isEstimate` (1).

**Verdict: real gap, accepted by decision** — the backend twin of the frontend's
presentation tokens. Asserting them pins that a constructor argument reached the
JSON, not behaviour; ADR 0013 leaves that to the integrated layer. Fields that
something *derives* are asserted, because then the assertion is about the derivation.
The note is on `ApiIntegrationTest`.

Four survivors that looked like this cluster were **real gaps and are now fixed**:
`caloriesRemaining`'s sign, `FoodController.byId`'s recipe branch, `EntryController.delete`
actually deleting, and a 409 carrying its domain message.

### `persistence` and `service` — the class 6 glue

**Repository write glue** — `FoodRepository.applyFrom` L100–101, `GoalRepository.insert`
L50–51, `WeeklyReviewRepository.insert` L85, `RecipeRepository.delete` L122,
`FoodRepository.findByIds` L53, `RecipeRepository.ingredientCounts` L112.

**Verdict: killed by an out-of-scope layer.** Each is a field-by-field projection onto
a jOOQ record, and its red is that the round trip stops matching — which
`ApiIntegrationTest`, `RecipeApiTest` and `GoalApiTest` assert through the API. The
individual `set` calls survive because a single dropped column usually leaves the rest
of the response correct; a standalone repository test asserting each setter would pin
the mapping twice and break on every schema change (ADR 0013, thin glue).

**Deletion return counts** — `PushSubscriptionRepository.deleteByEndpoint` L77,
`WeightMeasurementRepository.deleteById` L48, `EntryRepository.findById` L32.

**Verdict: real gap, low value.** The row count these return is discarded by every
caller — deletion is idempotent and the endpoints answer 204 either way (ADR 0021,
a foreign id must answer as an absent one). Pinning the count would pin a value
nothing reads.

**`FoodRepository.update` L89** — `rowsChanged > 0` → `>= 0`.

**Verdict: equivalent mutant in practice — but do not delete the guard.** Its only
caller is `RecipeRepository.update`, where reading the result is *the* ownership
gate: `recipe_ingredient` carries no `user_id` of its own (ADR 0021 — eight owned
tables, not nine), so the delete and insert that follow cannot express ownership,
and a no-op update that fell through would clear another User's ingredient lines.
The mutant survives only because `RecipeController` resolves the Recipe through a
scoped `findById` first, so no request can reach the repository with a foreign id —
the repository asks anyway, precisely so those two statements do not depend on
having been asked elsewhere. Unreachable *through the API*, not redundant.

**`VapidKeyStore` L29, L33, L36 (negations), L40, L48.**

**Verdict: equivalent mutant.** `generateAndStore` is INSERT-if-absent followed by a
read-back, precisely so two racing boots converge on one keypair — which also makes
generating redundantly indistinguishable from not generating. L40/L48 report
NO_COVERAGE when an earlier test in the same run already bootstrapped the key.
`privateKeyPkcs8Base64` returning `""` **was** a real gap and is now killed.

**`MartijndwarsWebPushSender` (8) and `UserReminder` (5).**

**Verdict: killed by an out-of-scope layer.** The transport's client lifecycle and the
reminder's per-User turn are proved by the `reminder-send` real-stack smoke, which
sends a real push and asserts the dedupe — a layer pitest cannot run. `ReminderPolicy`,
which holds the actual gating rules, is a deep module with its own test and is fully
killed.

**`CheckOutcome$Incomplete.getSource` (1)** — DTO accessor, as above.

### Noise removed at the source

Four `getLog()` companion accessors (`MartijndwarsWebPushSender`, `RecordingWebPushSender`,
`ReminderScheduler`, `UserReminder`) used to survive as `NullReturnVals`. They are gone,
not filtered: those loggers are now `private val` like `OpenFoodFactsProvider`'s and
`BarcodeLookupService`'s already were, so Kotlin emits no accessor to mutate.

---

## What the score still cannot ask for

Unchanged by any of the above, and worth re-reading before trusting a 100%:

- **pitest never mutates a constant** — the Atwater factors, `SMOOTHING`,
  `OBSERVED_WINDOW_DAYS`, `PACE_BAND`, `DRIFT_BAND_KG_PER_WEEK` and every timeout are
  invisible to it. A tuning constant needs a test asserting the number it produces.
- **Stryker has no truthiness mutator** — a guard distinguishing *absent* from *zero*
  needs an explicit zero case.
- Both engines reach the fast suites only. Playwright, the smokes and the
  Testcontainers e2e are out of scope in both.
