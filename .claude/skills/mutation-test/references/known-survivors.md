# Known survivors

Every mutant a full sweep leaves alive, with the verdict already reached for it.
Triage the survivors a _change_ introduces; check them against this list first, and
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

| package       | unkilled / total  | before         |
| ------------- | ----------------- | -------------- |
| `persistence` | 27/146            | 30/148         |
| `provider`    | 22/69             | 25/69          |
| `api`         | 12/226            | 22/226         |
| `domain`      | 8/411             | 38/411         |
| `service`     | 6/90              | 8/92           |
| `config`      | 3/23              | 23/23          |
| `security`    | 3/46              | 31/71          |
| **all**       | **81/1011 — 92%** | 180/1043 — 83% |

Frontend, `app/utils/` (`pnpm exec stryker run --mutate "app/utils/exits.ts,app/utils/navigation.ts,app/utils/numberField.ts,app/utils/reviewLedger.ts"`, ~1 min):

| file              | score     | before |
| ----------------- | --------- | ------ |
| `exits.ts`        | 100.00    | 60.00  |
| `numberField.ts`  | 100.00    | 75.00  |
| `navigation.ts`   | 86.49     | 72.97  |
| `reviewLedger.ts` | 85.00     | 85.00  |
| **all**           | **89.74** | 75.64  |

`security` and `config` moved most because 28 mutants left `--targetClasses` and two
new test classes made 43 of the rest killable; `domain` moved because 30 boundary
mutants got the tests they were owed.

---

## Frontend — StrykerJS

`app/utils/`, 8 survivors, all one cluster.

### Presentation tokens (8) — accepted, deliberately unasserted

| Where                                                         | Mutants |
| ------------------------------------------------------------- | ------- |
| `navigation.ts` — every `navDestinations` `icon` → `""`       | 5       |
| `reviewLedger.ts` — every `REVIEW_BASIS_BADGE` `color` → `""` | 3       |

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

| Where                                   | Mutant              | Verdict        |
| --------------------------------------- | ------------------- | -------------- |
| the model setter's `if (!value) return` | `if (false) return` | **Equivalent** |
| `valueId`'s `id.value ?? fallbackId`    | `??` → `&&`         | **Equivalent** |
| the malformed-date `console.warn` text  | text → `""`         | **Accepted**   |

A single-date `UCalendar` has no gesture that clears its own value — re-tapping the
selected day is inert — so the setter is never called with `undefined` and the arm
is unreachable. It exists because the writable computed's type is
`CalendarDate | undefined`, not because a deselect is expected. Confirmed by hand:
deleting the guard outright leaves the whole suite green. `prevent-deselect` was
tried here and dropped for the same reason — it changed nothing observable.

`valueId` is the only producer of that id, and both consumers — the `sr-only` span's
`:id` and the `aria-describedby` — read the same computed. Whatever string it yields
the two agree, so the link holds and no mutant of the fallback is observable.

_That_ the malformed branch warns is pinned; _what it says_ is not, because asserting
log prose makes the test fail on a reworded message rather than on a defect.

### `components/ProfileForm.vue` — 2 of 58

| Where                                    | Mutant | Verdict                |
| ---------------------------------------- | ------ | ---------------------- |
| `sexItems` — each radio's `label` → `""` | 2      | **Accepted, as above** |

Same class as the presentation tokens: with a blank `label` the radio's accessible
name falls back to its `value` (`MALE`), so it stays findable and operable and the
only loss is the display casing. The two `value`s — the figures that actually reach
`PUT /api/profile` — _are_ pinned, one test per sex.

### `composables/useCalorieTracking.ts` — 1 of 17

| Where                             | Mutant      | Verdict      |
| --------------------------------- | ----------- | ------------ |
| the fall-back `console.warn` text | text → `""` | **Accepted** |

_That_ a failed read warns is pinned; _what it says_ is not, as with `DateField`'s
malformed-date warning above.

Two neighbours are **not** survivors, and both stopped being ones by a change to the
code rather than to the tests. The `useState` initializer is killable because a failed
read now _holds_ the setting instead of restating the default — which makes the boot
value the only thing standing between a failed read and a nav that drops two tabs, and
`counts calories for a User whose Profile has never been read` pins it. And the
`retry: 0` on that read is pinned by `asks once, so a failure does not double the wait
the shell holds paint for`, which counts the requests: it is the third and last call
site ADR 0007 takes ofetch's stock GET retry off, and the only one where a retry would
block first paint rather than double a provider's load — which is what makes a
request-count test worth its weight here and not on the barcode look-ups.

### The two rings — 40 of 40

`RingGauge.vue`, `DayRing.vue` and `GoalRingTile.vue` are at 100%. Worth recording
because they got there by moving _up_ a layer, not by adding assertions to the old
one: the arcs used to be static template markup, which Stryker does not mutate at
all, and folding them into a shared `RingGauge` turned them into script — a real
mutable surface that nothing asserted. `RingGauge.test.ts` reads the circles off
the SVG, with the reason in the file: the gauge is `aria-hidden` by design, so
there is no accessible surface to query and the alternative is a ring that draws
nothing shipping green.

**Stryker gotcha found here:** a bare `defineProps<…>()` statement in
`<script setup>` breaks under instrumentation — the macro is left uncompiled and
every test rendering the component dies with `defineProps is not defined`, in the
dry run, before a single mutant. Binding it (`const props = defineProps<…>()`)
fixes it. The failure names the _consumer's_ test, not the instrumented file, so it
reads like an unrelated regression.

**Its sibling, which has no fix: `withDefaults(defineProps<…>(), { … })` cannot be
instrumented at all.** Stryker wraps the defaults object in its own coverage call,
and `defineProps` may not reference locally declared variables — so the SFC
compiler rejects it and the dry run dies before a single mutant, again naming a
consumer's test. Scoping around it is the only option, which makes
`ReviewDelta.vue`, `LedgerFigure.vue`, `LedgerBasisBadge.vue` and
`RecipeCompositionSheet.vue` **hand-check only**: mutate the line, run
`pnpm vitest run app/components`, restore. That is how `LedgerBasisBadge`'s
`placeholder: false` default was found unasserted (#249) — nothing failed when it
was flipped to `true`, and `ReviewLedgerItem.test.ts` now pins it.

`pages/profile/index.vue` scores 22/47 with 10 uncovered, and `pages/index.vue`
14/26 with 18 uncovered. **Pre-existing and untriaged** — neither page has been
swept; #248 added `index.test.ts` (the page had none) but scoped it to the Calorie
Tracking branches, so the fetch and mutation wiring around them is still unasserted
at this layer. `components/GoalProgressHero.vue` is 18/25, likewise pre-existing.

### `app/app.vue` — 30 of 30, and the engine never ran a test

Stryker cannot score the app root at all. Scoped to it alone the dry run **aborts**
rather than reporting survivors:

```
WARN VitestTestRunner Vitest failed to find test files related to mutated files
INFO DryRunExecutor No tests were found
ERROR Stryker No tests were executed. Stryker will exit prematurely.
```

`vitest.related` maps a mutated file to the tests importing it, and nothing imports
`app.vue` — it is mounted by Nuxt, and its concerns (the toast portal wrapper and its
`aria-live` politeness, the reactive `theme-color`, the toaster position split) are all
real-DOM facts that jsdom cannot stand in for. Their red lives in `e2e/toast.spec.ts`
and `e2e/appearance.spec.ts`, which is ADR 0013's thin-glue rule working as intended,
not a gap. In a whole-surface sweep the abort does not happen — the other files supply
related tests — and app.vue's mutants simply survive.

Hand-mutated instead, and the three that carry the a11y fix are all killed:

| Mutant                                         | Killed by                                        |
| ---------------------------------------------- | ------------------------------------------------ |
| drop `portal: '#tucker-toasts'` from `toaster` | all 3 `toast.spec.ts` sheet/announce tests       |
| `type === 'background'` → `'foreground'`       | the assertive and polite tests                   |
| remove the `aria-live` binding / the wrapper   | `…reaches the accessibility tree, Retry and all` |

**Gotcha, and it costs a run to learn:** scoped to this one file the Stryker _parent_
died with `FATAL ERROR: Reached heap limit` at V8's default 2 GB old-space — before
reaching the message above. `NODE_OPTIONS=--max-old-space-size=8192` gets to the real
error. This is the parent, not the test runner, so it is unrelated to the
`testRunnerNodeArgs` finding the skill records as changing nothing.

### `composables/useWeightLogging.ts` — 0 of 12

At 100%, and recorded because the last survivor was its `errorTitle` literal, killed
by asserting the toast title rather than only that a toast is raised. That is the
opposite verdict to `DateField`'s and `useCalorieTracking`'s warning text above, and
the line between them is who reads it: log prose is for a developer and rewording it
is not a defect, whereas the failure toast is the _whole_ of what a user gets when a
save is lost, and it competes with every other mutation's. `useApiMutation.test.ts`
pins that a passed `errorTitle` becomes the title; only the per-call-site literal is
left, and `toast.spec.ts` already pins `'Could not save profile'` at the Playwright
layer.

### `WeightSection.vue` and `WeightTile.vue` — hand-check only

Neither can be instrumented: `defineModel<boolean>('open', { default: false })` dies
in the dry run with `stryMutAct_9fa48 is not defined`, naming a _consumer's_ test.
Same mechanism as `withDefaults(defineProps<…>(), { … })` above — Stryker wraps the
options object in a coverage call and a compiler macro may not reference locally
declared variables. Confirmed by removing the options object, which instruments
cleanly. `ResponsiveOverlay.vue` carries the same shape and has no test of its own,
so it has never surfaced.

Hand-checked instead, both mutants killed: `{ default: false }` → `true` fails 8
tests; replacing the model with a local `ref(false)` — so the parent's
`v-model:open` is ignored and the sheet can never close — fails
`/profile logging a weight keeps the weight sheet up…` for `WeightSection`, and
`today.spec.ts`'s `the weight sheet stays put, reporting busy, until the save lands`
on both Playwright projects for `WeightTile`.

`components/GoalForm.vue` (14/16) and `components/GoalSection.vue` (19/33) are
**pre-existing and untriaged**; their survivors sit on the Zod messages, the
`reachedSince` reduce and the form-closing `watch`, none of which any change has
swept.

`components/LogWeightSheet.vue`'s remaining survivors are all in the re-seed
`watch(() => props.open)`. **Pre-existing and untriaged** — #241 only swapped its
date control. Its `'Pick a date'` survivor was **removed at the source** instead:
`measuredOn` is seeded from `date`/`today` and can only be changed by a picker
that is bounded to today and cannot clear itself, so a required-ness or range
rule there is a message nothing can ever show. The field is deliberately
unconstrained, and says so — unlike `ProfileForm`'s birth date, whose Zod rule
stays reachable on an API-supplied value.

---

### `components/IntakeBreakdownSection.vue` — 65 of 65, **all reported `no cov`**

**StrykerJS attributes none of this component's tests to it.** Every mutant lands in
`# no cov`, so the engine reports a 0% score for a file whose 18 tests pass and whose
legend rows, expander, coverage caption and ring feed are all asserted. Scoped to the
file alone the dry run refuses outright — _"Vitest failed to find test files related to
mutated files"_ — while `pnpm exec vitest related app/components/IntakeBreakdownSection.vue`
finds the spec and runs all 18. Do not read the 0% as a coverage gap, and do not "fix"
it by adding tests that already exist.

**Settled by hand-mutation instead**, which is the verdict this case is for. Each edit
below was applied to the source and the spec re-run; six of eight went red:

| Hand mutation                                            | Result       |
| -------------------------------------------------------- | ------------ |
| ring `data` → all zeroes                                 | killed       |
| ring `categories` → `{}` per arc                         | killed       |
| ring fed from the visible rows instead of `slices`       | killed       |
| expander `v-if` → `false`                                | killed       |
| revealed tail never appended to `rows`                   | killed       |
| coverage `days > 1` → `days >= 1`                        | killed       |
| coverage width read off `period` instead of the response | killed       |
| collapse watcher keyed to `period` instead of the window | killed       |
| collapse watcher removed                                 | killed       |
| `aria-busy` dropped                                      | killed       |
| centre readout matched on the slice's name alone         | killed       |
| centre readout `v-if="focused"` → `v-if="true"`          | killed       |
| centre readout's figures line blanked                    | killed       |
| swatch `v-if="row.color"` → `v-if="true"`                | **survived** |
| folded row's `pl-4` indent dropped                       | **survived** |

Both survivors are the folded row's _visual_ distinction, and neither produces a wrong
figure. Neither is equivalent, though: `intakeLegend` leaves a folded row's `color`
undefined — pinned by its own util test — so the swatch mutant renders a _transparent_
10px circle rather than a coloured dot, which keeps "no colour dot" true while shifting
every folded name right by the span plus its flex gap. Both are therefore real, and both
are left to the `/verify` walk-through: one is a `pl-4` class, and asserting classes is
the anti-pattern `component-testing-best-practices` names, while the other has no
accessible representation to query at all.

The eight survivors this component started with in slice 1 are gone, not filtered: the
whole `useRing` feed (`data`, `categories`, each arc's `name` and `color`) was
unreachable because the ring is `aria-hidden` by design, and is asserted through the
chart's own props — the only seam it has. See also the palette guard below.

### `components/DaySummary.vue` — 0 of 17

**`entries.length > VISIBLE` → `>= VISIBLE`** was a **real gap**, closed rather than
recorded: a day with exactly three entries offered a "Show all 3" that revealed nothing
it had hidden. Surfaced only because F14 slice 2 moved this component onto the shared
`useExpander` and so brought it into a sweep's scope for the first time.

### `plugins/auth-gate.client.ts` — 10 of 10

All **killed by an out-of-scope layer**, and only since `e2e/signed-out.spec.ts`
exists — before it, nothing in any suite killed them. The plugin is hook wiring:
its whole behaviour is that `/api` requests carry `redirect: 'manual'` and an
opaque redirect marks the session gone, neither of which any Vitest test can
observe (a fulfilled 3xx reaches the page as `net::ERR_ABORTED`, so `page.route`
cannot express it either — the spec serves the built app behind a real
redirecting origin instead).

Settled by hand: replacing the whole body with `defineNuxtPlugin(() => {})`
fails that spec on both projects. `isAuthRedirectResponse` itself is a deep
module and is pinned by `useAuthGate.test.ts`.

### `composables/useOptionalFetch.ts` — 2 of 33

Both **equivalent mutants**, and the staleness guards around them — on the success path,
the failure path and `pending` — are each killed by a test that overlaps two loads and
settles them out of order.

- **`const run = ++latestRun` → `--latestRun`.** The counter's only job is to give each
  run an id no other run shares and to mark every earlier run stale; counting down does
  both exactly as counting up does.
- **`if (mode === 'latest') inFlight?.abort()` → `if (true)`.** In `guard` mode the line
  is only ever reached when nothing is in flight — the early return above it fires while
  `pending` is true, and `pending` is true exactly while a request is out — so the
  controller it would abort has already settled, and aborting a settled controller does
  nothing.

### `composables/useCalorieTracking.ts` — 4 of 37

F14 slice 1 added `ready()`, so this file grew a shared `inFlight` promise and a
`settled` flag. Both `ready()` guards _are_ killed — the in-flight join and the settled
short-circuit each have a test that goes red when it is forced to `false`. What remains:

- **`useState(…, () => null)` L46 and `useState(…, () => false)` L53**, each replaced with
  `() => undefined`. **Equivalent mutants.** Both defaults are only ever read through a
  truthiness test (`if (inFlight.value)`, `if (settled.value)`), and `undefined` is falsy
  exactly as `null` and `false` are. Nothing can observe the difference.
- **`if (inFlight.value === started)` L74 → `if (true)`.** **Real gap, low value.** The
  identity check stops an _older_ `load` clearing the pointer to a _newer_ one still in
  flight. Reaching it takes two overlapping loads whose completion order is reversed, and
  the cost of getting it wrong is one redundant `GET /api/profile` — a later `ready()`
  fails to join and asks again. No wrong value is produced, and the answer falls back
  either way, so a test holding two reads open to pin it would cost more than the bug.
- **`console.warn('Could not read Calorie Tracking off the profile', …)` L103 → `""`.**
  **Real gap, low value**, and the same verdict as every other log-text survivor here: the
  test asserts the warning happened, which is the load-bearing part (ADR 0007 — the app
  quietly keeping its shape must not be the only trace). Pinning the wording would pin a
  string nothing reads.

### `utils/intakeBreakdown.ts` + `utils/entry.ts` — 1 of 48

**`key: 'other'` → `""`** in `intakeLegend`. **Equivalent mutant**, and the same verdict
this carried in slice 1 when the row-building still lived in the SFC. The ringed rows key
on `slot-${i}` and the folded ones on `folded-${i}`, and there is exactly one `Other` row
in any breakdown, so an empty string is as unique among the keys as the literal is.
Nothing renders differently and no warning is emitted. Its sibling — the `slot-${i}`
template — _is_ killed, by the test asserting every row keys apart, which is what stops
eight ring arcs collapsing into one.

`OTHER_COLOR` used to survive being blanked to `""`. The fix was
`utils/intakeBreakdownPalette.test.ts`, which holds `main.css` and the slot list in
agreement. Two things about it are load-bearing and easy to undo by accident:

- it reads the stylesheet via `import.meta.dirname`, **not** `process.cwd()` — under
  StrykerJS the working directory is the sandbox, where the `cwd`-relative read threw and
  took every assertion in the file with it;
- it reads `RING_SLOT_COLORS` / `OTHER_COLOR` **inside** the test bodies rather than at
  module load. Hoisted into an `it.each` table they are read at import time, Stryker
  attributes them to no test, and the file reports `covered 0` while passing.

Both failure modes look like a green guard that is not guarding anything.

## Backend — pitest

### Excluded from `--targetClasses` (28) — false survivors the tool cannot see

Not survivors any more; listed because the exclusion is the thing to re-check if
one of these classes gains real logic. Reasoning and hand-mutation evidence are in
`backend/build.gradle.kts` beside the flag.

| Class                                      | Was            | Settled by                                                       |
| ------------------------------------------ | -------------- | ---------------------------------------------------------------- |
| `security.AccessSecurityConfig` (+ nested) | 22/22 unkilled | deleting the authorize rule fails 142 tests                      |
| `security.AccessProperties`                | 3/3 unkilled   | blanking `audience` at its one call site fails 150 tests         |
| `TuckerApplicationKt`                      | 3/3 uncovered  | `main()` + a JVM DNS property; only `./gradlew e2eTest` boots it |

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

| Line   | Mutant                                                            | Verdict                                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 76, 77 | `remoteSetDecoder`'s `jwsKeySelector` / claims verifier removed   | **Killed by an out-of-scope layer — and none exists.** `AccessJwtDecoderTest` builds this decoder but deliberately never decodes with it: Nimbus fetches the JWKS lazily, and asserting more would mean reaching Cloudflare over the network from a unit test. The identical `localSetDecoder` shape is exercised by ~180 tests. |
| 89     | `localSetDecoder`'s `setJWTClaimsSetVerifier { _, _ -> }` removed | **Equivalent mutant.** Verified: the whole suite passes without it. Nimbus's default verifier only re-checks `exp`, which Spring's validators already reject on. The line states the division of labour (claims are Spring's job) and guards against a future Nimbus default; today it changes no outcome.                       |

### `persistence.OwnerEmailPlaceholderConfig` — 1 of 1

L39, `if (raw != null)` inside the `@Bean`'s `FlywayConfigurationCustomizer`.

**Verdict: false survivor**, same startup mechanism as the excluded three. Left in
`--targetClasses` because its neighbour `sqlLiteralSafe` — the escaping that actually
matters — is real logic and fully killed; excluding the file would hide that too.

### `provider.OpenFoodFactsProvider` — 22 of 69

**The DNS pre-warm (10)** — `prewarmDns` L100–102, `resolveHostUntilWarm` L107–119.

**Verdict: killed by no layer, and correctly so.** Best-effort startup mitigation,
run off-thread, whose failure is explicitly harmless — a real lookup still falls
through gracefully. Its only observable effect is the latency of the _first_ scan
after boot, which no test layer can see, and giving it a seam to count resolution
attempts would test the seam. Recorded rather than pinned.

**The retry caps (3)** — `lookupByBarcode` L133, `canRetry` L159 ×2.

**Verdict: equivalent mutant.** The loop bound and `canRetry`'s `attempt >= MAX_ATTEMPTS - 1`
are deliberate belt-and-braces: whichever one is mutated, the other still stops the
loop after 3 attempts. Mutating L133 changes nothing; mutating either L159 mutant
costs one extra 250 ms backoff before the loop ends on its own bound, and nothing
but an upper timing bound could see that. The suite uses a slack _lower_ bound on
purpose (see `minimumRetryDelay`), because upper bounds on wall-clock flake.

**The budget's exact edge (1)** — `canRetry` L160 `<=` → `<`.

**Verdict: equivalent mutant in practice.** Differs only when elapsed-plus-backoff
equals the retry deadline to the nanosecond, on a wall clock. The arithmetic either
side of it is pinned: _a retry that could not even finish its own backoff is not
attempted_ kills the `+` → `-` mutant, and two more tests pin the deadline itself.

**Log-message construction (7)** — `canRetry` L161, L164; `ask` L194, L195 ×3;
`readCandidate` L238.

**Verdict: noise.** `--avoidCallsTo` stops pitest mutating the `log.warn(…)` _call_,
but not the arguments it builds or the branch that picks between "retrying" and
"no verdict reached". Every one of these changes only what a log line says. The
return values beside them are all killed.

**`requestFactory` L310 — `setConnectTimeout` removed (1).**

**Verdict: killed by no layer.** The read timeout is pinned (_a Provider too slow to
answer…_); the connect timeout's red needs a **blackholed** address, so that connect
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
something _derives_ are asserted, because then the assertion is about the derivation.
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
caller is `RecipeRepository.update`, where reading the result is _the_ ownership
gate: `recipe_ingredient` carries no `user_id` of its own (ADR 0021 — eight owned
tables, not nine), so the delete and insert that follow cannot express ownership,
and a no-op update that fell through would clear another User's ingredient lines.
The mutant survives only because `RecipeController` resolves the Recipe through a
scoped `findById` first, so no request can reach the repository with a foreign id —
the repository asks anyway, precisely so those two statements do not depend on
having been asked elsewhere. Unreachable _through the API_, not redundant.

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
- **Stryker has no truthiness mutator** — a guard distinguishing _absent_ from _zero_
  needs an explicit zero case.
- **`x in a..b` hides a conditional pitest can negate but no test can reach.** A
  `require(entries.all { it.loggedOn in from..to })` in `IntakeBreakdown.of` left one
  unkillable `NegateConditionals` at a synthetic line past the end of the file, and it
  survived tests covering both bounds, the inclusive edges, and a valid element ahead of
  the offending one. Written out as `filter { it.loggedOn < from || it.loggedOn > to }`
  the same rule scores 100%. Prefer explicit comparisons in a guard you intend to pin —
  `none { … }` is no better than `all { … }` here; it is the _range_ that hides the
  conditional, not the quantifier.
- Both engines reach the fast suites only. Playwright, the smokes and the
  Testcontainers e2e are out of scope in both.
