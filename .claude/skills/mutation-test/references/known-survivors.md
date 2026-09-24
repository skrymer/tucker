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

Frontend, the async pair (`pnpm exec stryker run --mutate "app/composables/useAsyncAction.ts,app/composables/useApiMutation.ts"`, ~7 min):

| file                | score     | before |
| ------------------- | --------- | ------ |
| `useApiMutation.ts` | 86.30     | 84.75  |
| `useAsyncAction.ts` | 84.85     | 84.85  |
| **all**             | **85.47** | 84.81  |

`security` and `config` moved most because 28 mutants left `--targetClasses` and two
new test classes made 43 of the rest killable; `domain` moved because 30 boundary
mutants got the tests they were owed.

---

## Frontend — StrykerJS

`app/utils/`, 8 survivors, all one cluster.

### Vue compiler macros break the run before it starts

Not survivors — the sweep dies. Stryker rewrites a `.vue` SFC's `<script setup>` the
same way it rewrites a `.ts` file, and Vue's compiler macros are not ordinary calls, so
two rewrites are illegal in ways only the browser finds out:

- a bare `defineProps<T>()` wrapped in Stryker's `if/else` is no longer a top-level
  statement, and the compiler never replaces it → `defineProps is not defined`.
- `defineModel(…)`, `withDefaults(…)` and `defineOptions(…)` have their **arguments**
  mutated in place, and the compiler hoists those arguments out of `setup()` — past the
  point where Stryker's `stryMutAct_9fa48` helper is in scope → `stryMutAct_9fa48 is not
  defined`.
- a named `defineModel('creating', …)` has its **name** string mutated to `""`, which
  collides with the default model → `[@vue/compiler-sfc] duplicate model name
  "modelValue"`, and the initial test run crashes.

The fix is a `// Stryker disable next-line all: …` above the macro — or a `disable all` /
`restore all` pair around several adjacent ones (`TagPicker.vue`) — and it is load-bearing
across the components `grep -rl 'Stryker disable' frontend/app` lists. Do not tidy them away.
A **multi-line** `withDefaults(…)` needs a `disable` / `restore` **pair** — `next-line`
cannot reach the mutants inside the object literal (`LedgerFigure.vue` is the worked
example). Assigning `const props = defineProps…` to dodge it is not an option: ESLint
rejects the unused variable.

Upstream is [stryker-js#3305](https://github.com/stryker-mutator/stryker-js/issues/3305),
closed stale and still unfixed on Stryker 10.

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

### `components/IntakeBreakdownSection.vue` — `no cov` alone, 6 of 54 in company

**Scoped to this file alone, StrykerJS attributes none of its tests to it.** Every
mutant lands in `# no cov`, so the engine reports a 0% score for a file whose 18 tests
pass and whose legend rows, expander, coverage caption and ring feed are all asserted;
the dry run refuses outright — _"Vitest failed to find test files related to mutated
files"_ — while `pnpm exec vitest related app/components/IntakeBreakdownSection.vue`
finds the spec and runs all 18. Do not read the 0% as a coverage gap, and do not "fix"
it by adding tests that already exist.

**In a multi-file scope it does get scored** (88.89%, 48 killed / 6 survived), so the
`no cov` above is an artefact of the scope, not of the file. The six are all in the
ring readout and the period tabs, and none produces a wrong figure: the `value: 'today'`
tab literal and `name === null` readout guard are **killed by an out-of-scope layer**
(`e2e/intake-breakdown.spec.ts` switches periods and hovers arcs); the two
`OptionalChaining` removals and the tooltip slot's `return ''` are **equivalent** — the
box is made invisible in `main.css`, so what the slot returns is unobservable, and
neither optional chain has a null case a test can produce; and the `watch` losing its
`to` source is **equivalent** because `trailingWindow` moves both bounds together, so
watching `from` alone still fires the collapse.

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

### `components/ReferenceFoodPicker.vue` — 4 of 52

**`const query = ref('')` (1)** — StringLiteral.

**Verdict: equivalent mutant.** The initialiser is dead in every state where the box
is observable. The picker lives inside `ResponsiveOverlay` → `UModal`, a Reka Dialog
with no `force-mount`, so it is in the DOM only while `food !== null` — and the
`watch(food, …, { immediate: true })` assigns `query.value = current.name` on every
transition to non-null, in a `pre`-flush watcher that runs *before* render. Both
consumers mount it with `food` starting `null`. Killing it would take
`wrapper.vm.query`, which the component-testing conventions forbid. **It becomes live
if `ResponsiveOverlay` gains `force-mount`, or if that watch loses `immediate`.**

**`{ mode: 'latest' }` → `{ mode: "" }` (1)** — StringLiteral.

**Verdict: equivalent at every layer Tucker tests** — worded that way deliberately, so
a later reader does not conclude the abort is pointless and delete it from
`useOptionalFetch`, where it *is* pinned (`aborts the request it supersedes…`). `""`
matches neither branch, so there is no re-entry drop *and* no `inFlight.abort()`; every
run still takes a fresh `++latestRun` and every superseded one is still discarded by
`isStale()` on all three paths. The abort is redundant *for correctness* — a run is
aborted iff a later load started, which is exactly what makes it stale. What is
genuinely lost is ADR 0007's other reason for it, freeing the connection on a
constrained link, which no layer here can observe. Two things pin the rest: `""` is not
assignable to `'guard' | 'latest'`, so `pnpm typecheck` rejects it, and *searches the
Food it is on now, even while the last one is still out* pins that the mode is not
`guard`. **The sibling `{ mode: 'latest' }` → `{}` mutant was a real gap and is now
killed by that test** — under `guard` the superseded search is dropped *before*
`++latestRun`, so the previous Food's candidates land under the next Food's title and a
tap writes the wrong match.

**`searchBox.value?.inputRef?.focus()` (2)** — both OptionalChaining arms.

**Verdict: equivalent mutants**, same shape as `DateField.vue` above: the optionals
exist to satisfy `useTemplateRef<{ inputRef: HTMLInputElement | null }>`'s declared
type, not because either link is expected to be nullish. `clearSearch` has one caller —
the × button rendered in the `#trailing` slot *of that same `UInput`* — so the input is
mounted and the handler is synchronous; Nuxt UI's `Input.vue` renders its `<input
ref="inputRef">` unconditionally and exposes it. Hand-checked per the protocol: both
`?.` deleted, suite stays green at 20 passed.

### `composables/useReferenceFoodMatch.ts` — 0 of 27

Was 2 — both `errorTitle` literals, killed by asserting the toast **title** rather than
only that a toast was raised, which is the verdict `useWeightLogging` already records.
Worth restating why it is a gap and not a presentation token: ADR 0005 makes the title
the whole of what a User is told (the description is the shared connection message), and
`useApiMutation` derives `errorToastId` from it — so blanking both would collapse match
and unmatch onto one id, and a failed unmatch would replace a live match failure.

### `components/DaySummary.vue` — 0 of 17

**`entries.length > VISIBLE` → `>= VISIBLE`** was a **real gap**, closed rather than
recorded: a day with exactly three entries offered a "Show all 3" that revealed nothing
it had hidden. Surfaced only because F14 slice 2 moved this component onto the shared
`useExpander` and so brought it into a sweep's scope for the first time.

### `server/routes/sign-in.get.ts` — 2 of 2, both reported `no cov`

Both **killed by an out-of-scope layer**. The route is the redirect that hands a
User back into Tucker after Access signs them in; no Vitest test covers it, so
Stryker reports it uncovered rather than surviving. `e2e/signed-out.spec.ts`
asserts the status *and* the `location`, which is what makes the subtler of the
two killable — settled by hand: `sendRedirect(event, '', 302)` fails that spec on
`Expected "/" · Received ""`.

The exit's *pairing* with the service-worker denylist is a separate concern and
is pinned in Vitest by `exits.test.ts` (`app/utils/exits.ts` scores 8 of 8).

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

### `plugins/pwa-install.client.ts` — 2 of 2, and both are false survivors

The engine reports `startPwaInstallCapture()` deleted, and the whole plugin body
emptied, as surviving — and reports the file at 0% coverage while saying it "ran
all tests". Both are **false survivors**: applying either by hand fails **7**
tests across `usePwaInstall.test.ts` and `InstallPrompt.test.ts`, which dispatch
a `beforeinstallprompt` at `window` and have nothing listening without it.

The Nuxt test environment runs the real plugin list (`@nuxt/test-utils` boots
Nuxt's own client entry in a `beforeAll`), so the plugin *is* covered; what the
engine does not observe is the mutant reaching that boot. Don't write a test for
these, and don't exclude the file — hand-mutate to re-settle it if the plugin
body ever grows a decision. `usePwaInstall.ts` itself scores 50/50.

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

### `utils/catalog.ts` — 0 of 21, and the score was a lie

The file scores **100%** and did so while holding a user-facing bug: `filterFoods`
folded case on the query and not on the Food's name, so every query typed from the
start of a capitalised name — which is every Food name — matched nothing.

Not a survivor to triage, then, but the standing reason a 100% here is not evidence.
Stryker's `MethodExpression` mutator **swaps** `toLowerCase` for `toUpperCase` and
never **deletes** the call, so the two sides of a comparison are not independently
mutated: `fold(name).includes(fold(query))` and `name.includes(fold(query))` are
indistinguishable to the engine. Every normalise-then-compare function inherits this
— trimming, accent stripping, unit conversion, key canonicalisation.

What kills it is a fixture whose *stored* value needs the transform, not only the
query: `filterFoods(foods, 'tinned')` against `Tinned tuna`, and `'creme fraiche'`
against `Crème fraîche`. Both were added, and both were confirmed by hand-mutating
each side of the fold in turn — which is the only way to check this class at all.

### `pages/log.vue` — 14 of 57

The Log destination. Its slice-2 sweep scores 43/57; the fourteen alive split three ways,
and only one of them is on code slice 2 wrote.

**`filterFoods(catalog.value ?? [], …)` → `?? ["Stryker was here"]` (1, `no cov`).**
**Equivalent mutant.** `shown` is read only inside the catalog `<section>`, which renders
only where `catalogError` is falsy, and the read is awaited in `setup` — so the fallback
is a type requirement rather than a branch, and no state evaluates it.

**The `/api/foods/frequent` call's options (3).** Blanking `{ query, signal }`, blanking
`{ mode: 'latest' }`, and emptying the mode string. The first is **killed by an
out-of-scope layer** — `e2e/log.spec.ts` "ranks the frequent foods over the trailing 30
days…" asserts the window asked for, exactly once. The other two are a **real gap**
carried from slice 1: `useOptionalFetch.test.ts` specifies both re-entry policies, but
nothing pins that *this* call site picks `latest`, and the behaviour that separates them —
a reload issued while one is in flight — needs two overlapping loads to observe.

**The two sheet composables' plumbing (10).** `usePickedFood`'s `onLogged` clearing
`picked` and its `gate.reset()` on pick and on close, and `useEstimate`'s `open.value =
false` and its `watch` guard. The sheet closing after a log **is** killed by
`e2e/log.spec.ts` and the real-stack smoke, both of which assert `toBeHidden()`. The rest
are a **real gap** carried from slice 1 — picking a second Food while an over-budget
warning stands, and closing the grams sheet without logging, are states no Vitest test
enters. `watch(open, …)`'s two mutants are **equivalent**: resetting on open leaves the
form just as clean as resetting on close, so nothing observable separates them.

### `components/AddSheet.vue` — 21 of 118

The Add-Food overlay: the barcode look-up, the camera scanner and the Food|Recipe
switch. Never swept until [#303](https://github.com/skrymer/tucker/issues/303),
which took it from 77 killed / 38 survived to **95 killed / 21 survived / 2 no cov**.
Of the 21, **nineteen are equivalent mutants** and two are **real gaps** carried: the
close branch's `cancel()`, which no test drives, and `cache: 'no-store'`, which no
layer the engine or Playwright can run honours at all.

**The `{ kind: 'manual' }` discriminant (8).** `branch`'s initial value, the
`timedOut` arm's assignment, the `catch`'s, and `reset()`'s — each mutated to `{}`
and to `{ kind: "" }`. `'manual'` is the union's default arm and is compared against
nowhere: every read tests `'candidate'` or `'existing'` and falls through to manual,
so an absent or empty discriminant selects exactly the same branch. Typecheck rejects
the mutants; nothing at runtime can see them.

**The `timedOut` arm (3).** `if (false)`, `=== ""`, and the block emptied. Bypassing
the arm falls through to `const result = outcome.value` — `undefined` for a timed-out
outcome — which throws, and the `catch` sets byte-for-byte the same state
(`{ kind: 'manual' }` plus `inconclusive = true`). Load-bearing for intent, not for
behaviour: it stops being equivalent the day `AsyncOutcome.timedOut` carries a value
or `isNotFound` widens.

**`result.outcome === 'EXISTING' && result.food` (2).** `&&` → `||`, and the left
side → `true`. The `&&` exists only to narrow the OpenAPI-nullable `food` for
TypeScript; no response the backend can produce carries a `food` without the
`EXISTING` outcome, or the outcome without the food, so both mutants select the arm
the original does.

**The two `cancel()` calls (2), and they are not the same verdict.** `reset()`'s
(`:145`) is an **equivalent mutant** under single mutation: `reset()` runs on the way
*in*, and the close branch has already aborted on the way *out*, so by the time it
runs there is nothing left in flight to cancel. The close branch's (`:191`) is a
**real gap**: the overlay holds this component mounted through its exit animation —
which `AddSheet.test.ts` › *leaves its contents alone while it closes* exists to
prove — so without it a late result visibly replaces the contents of a sheet the
User has just dismissed. No test drives that window.

**`watch(mode, …)`'s residue (2).** `if (true) stopScan()` and `current !== ""`.
`AddSheet.test.ts` › *releases the camera when the user switches to the recipe
builder* kills the other four. Both survivors only widen the watcher to fire on the
recipe→food transition as well, where the camera is already stopped — **equivalent
for every sequence a User can produce**, with one contrived exception worth writing
down rather than glossing: `useBarcodeScanner`'s `decodeFrame` catch sets
`state = 'unsupported'` without re-checking generation, so a `readBarcodes`
rejection landing *after* the tab switch leaves that alert standing, and coming back
to Food would clear it under the mutant and keep it under the original. Unreachable
without a decoder that fails mid-switch; recorded, not chased.

**`formSession.value++` → `--` (1).** The counter is only a `:key`; it has to change
per open, not increase.

**Two nobody can run here (2).** `cache: 'no-store'` → `""` is a browser fetch
semantic that `registerEndpoint` never honours — a **real gap** with no layer to put
it in, since the mocked Playwright suite stubs the same requests. `{ mode: 'latest' }`
→ `{ mode: "" }` is the standing `ReferenceFoodPicker` verdict: supersession is safe
on `useAsyncAction`'s generation counter, and only the *abort* is lost, which nothing
observable depends on.

`existingFood`'s ternary → `true ? branch.value.food : null` rounds it out: the
non-existing arms have no `food`, so the computed is falsy either way.

The two `no cov` are the same discriminant again — the branch ternary's final
`: { kind: 'manual' }` fallback, reached only by a response that is neither
`EXISTING` nor a candidate, which the backend does not produce.

### `pages/foods.vue` — 19 of 71, and 18 with no coverage

The catalog page. **Every survivor is glue** — `useApiMutation` option objects, their
`errorTitle` strings, their `onSuccess: () => refresh()` arrows, and two defensive
guards — which ADR 0013 says is driven by the integrated test rather than given one
of its own. Stryker cannot run those layers, so they survive by construction. #303
leaves it at **34 killed / 19 survived / 18 no cov**, up from the 22/22 the issue
reported. What moved the score is the closed-world toast assertion in
`foods.test.ts`; the `handleCreateIngredient` gap #303 also closed is at the
Playwright layer, which no Stryker score can show. (Don't reconcile the two figures
by subtraction — the baseline was taken against the file as F16 slice 3 left it.)

**The four mutations' option objects and their `onSuccess` (8).** Four whole option
objects emptied to `{}` (`:73`, `:98`, `:116`, `:140`), three `onSuccess: () =>
refresh()` arrows blanked (`:77`, `:100`, `:118` — the fourth, `handleEditRecipe`'s
at `:142`, reports `no cov` rather than surviving), and `:108`'s whole request arrow
replaced by `() => undefined`. Each is **killed by an out-of-scope layer**, with a
named killer:

| mutation | killer | what it asserts |
| --- | --- | --- |
| `handleSubmit` | `e2e/smoke/add-food.smoke.spec.ts` | the new row, with its derived kcal |
| `handleCreateIngredient` | `e2e/recipe-builder.spec.ts` › *user adds a new food inline…* | the POST body, and the Food in the catalog behind the closed sheet |
| `handleSubmitRecipe` | `e2e/smoke/create-recipe.smoke.spec.ts` | the recipe's row |
| `handleEditRecipe` | `e2e/smoke/recipe-edit.smoke.spec.ts` | the sheet closing, and the recipe re-read over the API |

The `handleCreateIngredient` row is the one #303 added; before it, that mutation was
a real gap with no killer at any layer. `recipe-edit`'s is the weakest of the four —
it never reads the row, so it kills the emptied option object but would not catch
`refresh()` removed on its own. That mutant is `no cov` rather than a survivor, so
nothing is claimed for it here.

**The five `errorTitle` strings (5).** A **real gap**, carried, and explicitly *not*
the accepted presentation-token class above — the same verdict this file already
reaches for `useWeightLogging` and `ReferenceFoodPicker`, and for the same
mechanism: ADR 0005 makes the title the whole of what a User is told, and
`useApiMutation` derives `errorToastId` from it, so a blanked title collides two
unrelated failures onto one toast. Two of the five are already the same string
(`'Could not add food'`, deliberately — both are an add failing), which is what
makes the third and fourth collapsing onto them invisible. Only the hand-rolled
`onValidationError` toast is pinned, by `foods.test.ts` › *surfaces the rule
message…*, and that is a different call.

**`watch(open, …)` and `watch(recipeToView, …)` (5, plus `:200`).** **Equivalent
mutants.** `if (!isOpen)` → `if (true)`: dropping `?add=1` on the way in changes
nothing, the sheet being open already. `if (opensAddSheet(route.query))` → `if (true)`
replaces the query with itself when there is no `add` to spend, and
`router.replace({ query: rest })` → `{}` drops a query `/foods` never has anything
else in. `sheetSession`'s `if (true)` and `--` both keep the value distinct per open,
which is the only thing `savingFromThisSheet` compares. `if (food) deleteFood(food)` →
`if (true)` is unreachable: the confirm dialog renders only with a Food selected.

`watch(recipeToView, …)` clearing `createdIngredient` is the same shape and reports
`no cov` for all four of its mutants: `RecipeBuilder`'s own `createdIngredient` watcher
is not `immediate` and every assignment is a fresh object off a fresh response, so no
sequence makes a stale value fire it. Symmetric with `watch(open, …)`'s clear, and kept
for that symmetry.

**The 18 with no coverage** are those four plus the request shapes of the four
mutations — the paths, the methods, the bodies and the two `onSuccess` blocks — which
no Vitest test reaches at all. Each is **killed by an out-of-scope layer**, by the same
smoke named above for its mutation: a blanked path or method fails the request the smoke
asserts the result of.

### `composables/useAsyncAction.ts` + `composables/useApiMutation.ts` — 24 of 158

The shared async primitive ([0007](../../../../docs/adr/0007-async-in-flight-state.md))
and the mutation factory ([0005](../../../../docs/adr/0005-notifications-persistent-errors-quiet-success.md))
that composes it. First swept closing [#222](https://github.com/skrymer/tucker/issues/222)
and [#197](https://github.com/skrymer/tucker/issues/197): **34 survivors + 7 no-cov →
19 + 5**, 74.05% → 84.81%, with 17 killed by nine new tests. **Every one of the 24
left is an equivalent mutant** — no gaps, no out-of-scope kills, no false survivors.
Ten of the seventeen were gaps a read-only triage agent found; the rest came out of the
sign-off's review gates, which is worth knowing: the sweep's own verdicts were not the
last word on it.

**`settle()`'s abort guard, and only that one (3).** `:76`'s `signal.aborted` and both
literals of its return. `run()` races the action against `rejectOnAbort`, which rejects
**synchronously** the moment the signal aborts, so an abort that beats the action sends
the run to the `catch` and never to `settle`. Reaching `settle` with `aborted` true
therefore needs the action to have resolved *first* — and then the only abort that does
not also bump `activeRunId` is the timeout, which is a macrotask and cannot interleave
between the race latching and the `await` continuation. Don't delete it: it is the
defence for an action that resolves and times out in one tick.

`:75`'s `isStale()` beside it looked like the same verdict and **is not** — it was
recorded as equivalent on the argument above and that argument is wrong for supersession.
Once the action has resolved the race has latched on its value, and a later `abort()`
cannot unseat it, so a same-tick supersede *does* reach `settle` with the run stale. It
is killed now, by `discards a result that landed in the same tick as the run replacing
it` — four lines, no fake timers. Production cannot produce that tick (both `latest`
consumers start a look-up from a user gesture or a decode event), but the mutant is real:
without the guard a same-tick supersede reports `timedOut`, which on `/check` is an
**Inconclusive Lookup** with a "Try again" raised over a screen the newer look-up owns.

**`rejectOnAbort`'s own internals (6).** `:140`'s two string literals — since
[#222](https://github.com/skrymer/tucker/issues/222) nothing reads the error's name or
message, because a rejection from here always implies `signal.aborted` and so returns
`timedOut` rather than being rethrown. `:141`'s `if (signal.aborted) fail()` (and its
`no cov` call) guards a controller created four lines earlier that nothing can have
aborted yet. `:142`'s `{ once: true }` → `{}` / `false`: an `AbortController` dispatches
`abort` at most once, so `once` governs listener cleanup and never a second call.

**The timeout timer's clear (3).** `:82` in all three forms. `clearTimeout(undefined)` is
a no-op, and an uncleared 8 s timer aborts a controller whose run has already settled and
which no newer run uses — a timer leak, not a behaviour change.

**Three one-liners, each a no-op (3).** `:49`'s `mode === 'latest'` → `true`: in `guard`
mode a new run only starts once the prior one is fully settled, so aborting its controller
does nothing and the race has already handled the late rejection. `:58`'s `isStale()` →
`false`: every path that makes a run stale aborts its signal first, so `settleLifecycle`
clears `delayTimer` microtasks later and the callback can never fire stale. `:89`'s
`appearedAt !== null` → `true`: `400 - (Date.now() - null)` goes hugely negative, so
`releaseBusy()` sets an already-null `shownAt` to null. (`:96`'s `> 0` → `>= 0` was
the fourth and is killed: at exactly zero the original releases synchronously and the
mutant defers a macrotask, which is visible if the test settles the action at precisely
`delayMs + minBusyMs` rather than at a round number past it.)

**`useApiMutation`'s two unreachable statuses (6).** `:169`–`:173`, both branches and the
`no cov` block behind `timedOut`. `superseded` is ruled out three times over — `:138`
bounces re-entry before `run` is called, `guard` mode, and no `cancel` exposed — and
`timedOut` needs a `timeoutMs` this factory never passes. They are kept *split* rather
than merged deliberately: the two are opposites under
[0007](../../../../docs/adr/0007-async-in-flight-state.md), and a single silent `return`
would pre-bless the wrong answer for a timeout the day someone adds the option.

**The redundant re-entry guard (1).** `:138`'s `if (pending.value) return` → `false`. The
primitive's own guard returns `superseded` for the same re-entry and `:169` then returns
silently, so behaviour is byte-identical either way. Belt-and-braces, not a gap.

**The spend counter's direction (1).** `:95`'s `(… ?? 0) + 1` → `- 1`. A closed toast's
id is given up by moving the counter (#324); *which way* it moves is not a property the
id has to have, since `- 1` yields `0, -1, -2, …` — every bit as distinct, never
revisited, and `?? 0` is reached only on the undefined case either way. Equivalent
mutant.

**Optional chaining on a shape no layer produces (2).** `:30`'s `e?.status` and `:31`'s
`e.data?.message`. `$api` always throws a `FetchError`, nothing rejects with `null`, and
reaching `:31` requires `status === 400`, which requires a response. ofetch assigns
`response._data` only when the response has a body, so `error.data` *can* be undefined in
principle — but not from a browser, where a `Content-Length: 0` response still carries a
non-null empty stream and `destr('')` yields `''`.

What the nine new tests bought, worth keeping in view when this file next moves: a
spinner that appeared 150 ms *after* a fast call finished and never came down
(`clearTimeout(delayTimer)`), a spinner never released on the ordinary >550 ms call
(`else releaseBusy()`), `pending` cleared out from under a run still in flight, a
cancelled run resurfacing as a *timeout* over the screen that replaced it (either
`activeRunId` update operator), a failed save routed to a form field with no toast
(the 400 guard and its `&&`), and ADR 0005's quiet success — which **nothing** pinned,
so every mutation in the app would have popped a titleless toast.

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

**`WeightTrend.smooth` (1)** — `throwIndexOverflow` removed. Reported against `from`
until ADR 0032 moved the recursion into `smooth`; same guard, same verdict.

**Verdict: noise.** The overflow guard Kotlin compiles into `forEachIndexed`;
reaching it needs more than 2³¹ measurements. Not filtered, because the only
available filter is `avoidCallsTo kotlin.collections.CollectionsKt`, which would also
silence `sortedBy`, `sumOf` and every other collection call in the codebase.

**`WeightTrend.weighedDaysSince` (3)** — `throwCountOverflow` removed, a negated
conditional, and a conditional boundary, all reported against line numbers past the
end of the file.

**Verdict: noise, and measured rather than argued.** The three sit in the body
Kotlin inlines from `Iterable.count`, not in the one-line predicate: its `this is
Collection` test, which a `List` always satisfies; its `count < 0` overflow check,
reached only after an increment so never at the boundary; and the overflow throw
itself. Rewriting the function as an explicit loop — no inlined stdlib — scores
**38/38** with the same tests and leaves only `from`'s survivor above, which is what
says the tests pin the behaviour and the engine is looking at machinery. The
idiomatic `count { }` ships: choosing the loop would be picking worse code to please
the tool, the same move as narrowing a scope.

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

### `domain.ReferenceFoodQuery$Companion.startsAt` (1) — false survivor

Reported **NO_COVERAGE**, `NegateConditionals`, at *line 79 of a 67-line file* — the
synthetic line pitest attributes to the lambda inlined by `phrase.indices.all { … }`.
The same shape as the `x in a..b` note at the end of this file, and settled the same
way: hand-mutating `== phrase[it]` to `!=` fails **15 tests** across
`ReferenceFoodQueryTest` and `ReferenceFoodRankingTest`. The tool cannot see it; no
test is owed. Kotlin's inlining is what `*$$inlined$*` filters elsewhere, and there is
nothing to filter here — the mutant is on the enclosing method, not on a generated
class.

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

### Micronutrient Intake — 5 of 145, every one a false survivor

Swept scoped to the F15 figures slice. **All five survivors are the tool failing to
run a test that kills them**, each settled by hand-mutation, and the pattern is worth
knowing: a scoped sweep whose classes are covered by `@SpringBootTest` tests selects
badly, so `succeedingTests` comes back empty on a mutant the suite would catch.

| Hand mutation                                            | Tests it fails |
| -------------------------------------------------------- | -------------- |
| `NutrientReferenceValues.forBody` `fromAge <= age` → `<`  | 2              |
| `ReferenceFoodRepository.findByIds` → always `emptyMap()` | 8              |
| `Micronutrients.<init>` `it >= 0` → `it <= 0`             | 6+             |
| `namesOf`/`search`/`namesTheWholeFood` (mutated together) | 27             |

Do not write tests for these — `NutrientReferenceValuesTest` and
`MicronutrientIntakeApiTest` already pin them. Read an empty `succeedingTests` on this
scope as "unproven", not as "unasserted".

**The one real gap the sweep did find** was `MicronutrientIntakeResponse.hasReferenceIntakes`,
surviving both `BooleanTrueReturnVals` and `BooleanFalseReturnVals`: the domain asserted
the flag, nothing asserted it reached the wire, so the controller could have shipped
either constant and only the browser would have known. Closed by
`MicronutrientIntakeApiTest.the wire says whether there was a body to read the window against`,
which reads the same poorly-matched window with and without a Profile.

**4 `NO_COVERAGE`** — `Micronutrients.getAmounts`, `Micronutrients$Companion.getALL`,
`ReferenceFood.getPublicFoodKey`, `ReferenceFoodRepository$Companion.getRANKED`. Data-class
accessors and constants, the categories the section above and "What the score still cannot
ask for" already settle.

### Micronutrient Intake, Recipes contributing — 107 of 115

Swept scoped to the F15 slice-3 classes (`BorrowedFood`, `BorrowedIngredient`,
`FoodContribution`, `MicronutrientClaim`, `MicronutrientIntake`, `MicronutrientRow`,
`Micronutrients`, `ReferenceFood`, `UnmatchedFood`, `RecipeRepository`). **`divide`'s
boundary is killed** — the slice's own tests reach it — and the sweep leaves 3
`SURVIVED` plus 5 `NO_COVERAGE`.

**All three `SURVIVED` are false survivors**, each settled by hand-mutation, and it is
the same bad selection the slice-2 section above records: these classes are covered by
`@SpringBootTest` tests, which a scoped sweep does not pick.

| Hand mutation                                                     | Tests it fails |
| ------------------------------------------------------------------ | -------------- |
| `MicronutrientIntake.of` `!references.isNullOrEmpty()` negated      | 3              |
| `RecipeRepository.ingredientsOf` → always `emptyMap()`              | 7              |
| `RecipeRepository.ingredientCounts` → always `emptyMap()`           | 3              |

Do not write tests for these. `MicronutrientIntakeTest`, `MicronutrientIntakeApiTest`,
`RecipeApiTest`, `RepositoryRoundTripTest`, `CrossUserIsolationTest` and
`FoodFrequentApiTest` already pin them between them.

**`RecipeRepository.delete` was not a survivor — it was dead code, and is now gone.**
`VoidMethodCallMutator` stripped `foods.delete(id)` from it and nothing noticed because
nothing called it: deleting a Recipe goes `FoodController.delete` → `FoodService.delete`
→ `foods.delete(id)`, and no test called it either. It was also a bypass — the refusal
rules that guard the delete live in the service — so the answer to its `no cov` was to
delete the function rather than to write a test for it. Kept here as the worked example:
`no cov` on a one-line delegation is worth checking for callers before it is worth
checking for tests.

**Correction to the section above: `Micronutrients$Companion.getALL` is a false survivor,
not an accepted accessor gap.** It is a hoisted `Micronutrient.entries.toSet()` behind
`Micronutrients`' own `require(amounts.keys == ALL)`, so blanking it to `emptySet()` makes
every `Micronutrients` construction wrong and fails 5+ tests across `CrossUserIsolationTest`
and `FoodReferenceFoodApiTest`. `NO_COVERAGE` on a *constant* read only from an `init`
block is the same caching wall, not an unasserted DTO field.

**The remaining 4 `NO_COVERAGE`** — `BorrowedFood.getIngredients` plus
`Micronutrients.getAmounts`, `ReferenceFood.getPublicFoodKey` (both already listed above).
Data-class accessors, the category `domain` and "What the score still cannot ask for"
already settle.

### Weight Timeline, frontend — 60 of 63, then 100% on the two files that owed tests

Swept scoped to the F17 slice-1 frontend files. Three survivors, all real gaps, all
closed and re-swept clean: `weightTimelineSeries`' `at` and `kgTick` accessors (only
ever asserted through the chart's props, which is the *component's* seam, not the
util's) and `useWindowedFetch`'s `{ mode: 'latest' }` — that last one because the
supersede test asserted only *which answer wins*, which the stale-run guard delivers
without the abort. The mutant `{ mode: "" }` keeps the guard and loses the abort, so
the missing assertion was the superseded run's `signal`.

The 109 `NoCoverage` mutants in the same run are the `.vue` and page files, which
Stryker attributes to no test even though their component tests import them directly.
Hand-mutation settles it, per this file's standing rule: the scatter's `y` swapped to
the trend's, the crosshair handler made a no-op, and `SectionTabs`' `role="group"`
removed each fail the component tests. Tooling blind spot, not a gap.

### Weight Timeline — 63 of 68, and the one new report is a `MEMORY_ERROR`

Swept scoped to the F17 slice-1 classes (`WeightTimeline`, `WeightTrend`,
`WeightTimelineController` and its DTOs). Four of the five non-killed are the
`WeightTrend` entries already recorded above — the stdlib overflow guards and the
body Kotlin inlines from `Iterable.count`, none of which the slice moved.

The fifth is new and is **not a survivor**: `WeightTimeline$Companion.of$lambda$2`
is the `takeWhile { !it.isAfter(to) }` that bounds the day sequence, and
`BooleanTrueReturnVals` makes it never stop — `generateSequence` then runs until the
JVM dies, so pitest reports `MEMORY_ERROR` rather than `SURVIVED`. That is the
memory-shaped version of a timeout verdict: the mutant is detected, loudly.

### Weight Timeline, the intake half — `weightTimeline.ts` 128 of 131

Three left, none of them a gap:

- **`kgTicksBetween`'s `?? KG_TICK_STEPS[length - 1]`** reports `NoCoverage`: the
  `find` only fails for a weight range wider than **20 kg**, which a 28- or 90-day
  window cannot hold. Unreachable, not untested.
- **`tick <= high + step / 2 ** 10` → `<`** is equivalent. The epsilon exists so a
  tick landing exactly on `high` survives floating-point accumulation, and it is
  wider than any value the loop produces, so the two comparisons admit the same
  ticks.
- **`if (day.caloriesKcal == null) return current.unloggedKg` → `false`** is
  equivalent for a subtle reason worth writing down: the fall-through computes
  `toKg(null)`, and `null / ceilingKcal` is **0** in JavaScript, so it returns
  `floor` — which `Math.max(…, current.unloggedKg)` then raises back to exactly the
  tick the branch would have returned.

Everything else the first sweep left alive was a real gap and is closed: the scale's
whole geometry (the 55/40 split, the headroom over the tallest of calories *and*
Budget, the flat-window padding, a no-reading day's carried trend contributing to the
band), the kilogram tick step at two widths, the readout and colour of a day logged
before the first review, and the five colour constants — which the component test
could never kill, because it compared each constant against itself.

### Weight Timeline, the plan — `weightTimeline.ts` + the section, 247 of 260

The three intake-half entries above are unchanged. Five more, none a gap, plus three
real ones that are closed:

- **`exits`' and `enters`' predicates → `true`** are **false survivors**. Hand-mutating
  `findIndex((kg) => kg != null && kg < low)` to `findIndex(() => true)` fails **8**
  tests, and the same on `findLastIndex` fails **6** — Stryker lists the right covering
  tests and still reports both alive. Hand-mutate before writing anything for a
  survivor in this function.
- **`if (kg == null) return []` → `false`** is equivalent, and JavaScript is why: the
  fall-through then asks `null < low`, which coerces `null` to **0** and is therefore
  true for any real kilogram, so the day takes the `exits` branch — and `exits` skips
  nulls, so it never matches and the day returns `[]` either way.
- **`planClipped`'s `plan.value?.clips` → `plan.value.clips`** is equivalent: a Vue
  computed is lazy, and the template reads it only inside `v-if="plan"`, so the
  optional call is unreachable rather than untested.
- **`TimelineIntake.loggedDaysIn`'s negated conditional** is a **false survivor** —
  `days.count { it.caloriesKcal == null }` by hand fails 4 tests. Its two siblings
  (a `ConditionalsBoundaryMutator` and a `NO_COVERAGE` on `throwCountOverflow`) are
  Kotlin's inlined `count` overflow check, which no assertion can reach.

Closed rather than excused: the ceiling's `>` (two mutants — a plan peaking *within*
the two-kilo stretch lands exactly on `high`, which `>` and `>=` disagree about, and
no test had a plan above the weights but in reach), `clipKg`'s `?.` (nothing called
the marker accessor on a timeline with no plan), and the section's `() => props.timeline`
getter (no component test called `dayTick`, so the chart could have been wired to
nothing and the day axis would simply have been blank).

### `date.ts`'s cached `Intl.DateTimeFormat` — 7 false survivors, settled by hand

Every mutant of the two module-level formatters' arguments survives
(`'en-GB'` → `""`, `month: 'short'` → `""`, …). They are **false survivors**: a
module-level initialiser runs at import, before Stryker sets the active mutant, so
the mutated literal is never the one the formatter was built from. Hand-mutating
`month: 'short'` → `'long'` fails **7 tests** across `date.test.ts` and
`weightTimeline.test.ts`.

The same wall as the backend's Spring-context entries above, in a different engine:
suspect anything evaluated once at load time. The cache is worth its blind spot —
`toLocaleDateString` with an options object rebuilds an ICU formatter per call, ~70x
the cost, which a 90-day timeline paid ninety times over.

### Weight Timeline, the intake half — backend 87 of 90

Four non-killed, all already-recorded categories:

- Three are the **`Iterable.count` body Kotlin inlines** into `WeightTimeline.of`
  for `days.count { … }` — a `NegateConditionals`, a `ConditionalsBoundary` and the
  `throwCountOverflow` call, all reported against line numbers past the end of the
  file. The same stdlib noise `WeightTrend` already carries here.
- The fourth is the `MEMORY_ERROR` on `of$lambda$2` recorded above; it did not move.

`TimelineIntake`'s two constructor properties used to add a pair of `NoCoverage`
accessors. They are gone rather than filtered: nothing outside the class reads the
map or the list — it answers `caloriesOn` and `budgetOn` — so they are `private`,
and Kotlin emits no accessor to mutate.

### Tags, backend — 159 of 178

Swept scoped to the F18 slice-1 classes (`Tag`, `TagName`, `Food`, `TagRepository`,
`FoodRepository`, `RecipeRepository`, `TagController`, `FoodTagController`,
`FoodDescriber`, `FoodController`, `RecipeController`). Nineteen non-killed:

- **Three false survivors, settled by hand-mutating a throwaway copy of `backend/`**
  (the worktree is gated by probity, and a hand-mutation is not a red step). The same
  bad selection the Micronutrient sections record: a scoped sweep over
  `@SpringBootTest`-covered classes picks the wrong tests.

  | Hand mutation                                  | Tests it fails |
  | ---------------------------------------------- | -------------- |
  | `FoodRepository.carryingTags` → `emptyList()`  | 71             |
  | `TagRepository.findByIds` → `emptyList()`      | 7              |
  | `FoodResponse.tags` built as `emptyList()`     | 4              |

- **`TagName.hashCode` → `0` — equivalent.** A constant hash keeps the contract, and
  equality is what the tests pin. **`TagName.toString` `NO_COVERAGE` — equivalent**:
  a debugging rendering nothing reads.
- **`FoodController.frequent`'s `requireWindow` call removed — equivalent in outcome**:
  `FrequentFoods.rank` refuses the same window, one query later.
- The rest are already recorded above: the `FoodResponse` accessors (the `api`
  section's accepted DTO class), `FoodRepository.applyFrom`'s two macro setters and
  `findByIds`, and `RecipeRepository.ingredientCounts` / `ingredientsOf` (the
  Micronutrient false survivors, which moved line but not verdict).

### Tags, frontend — `FoodTagsSheet.vue` 35 of 39, `rowTags.ts` 10 of 10

`FoodListItem.vue`'s one `NO_COVERAGE` (`props.food.tags ?? []`) and `FoodTagsSheet`'s
`food?.tags ?? []` are **equivalent**: the wire always carries `tags` (ADR 0023), so
the fallback is unreachable. The sheet's other three are equivalent too — the initial
`draft` is overwritten by the immediate `watch`, the abort `signal` matters only on a
cancellation no test drives, and the initial search term is cleared by Reka on open
(the empty-field assertion passes under the mutant). The five real gaps the first
sweep found — offering nothing before the Tags load, not fetching while closed, adding
a created Tag to a Food wearing none, and the two `errorTitle` literals — are closed.
`foods.vue`'s `useFoodTagging` request and option objects are **killed by
`e2e/food-tags.spec.ts`**, which asserts the PUT body and the sheet closing;
`if (target)` is equivalent, Save being reachable only from an open sheet.

**The picker moved to `TagPicker.vue`** (F18 slice 3), shared by `FoodTagsSheet` and
`AddFoodForm`; the sheet's equivalents above now live there. Also equivalent: `lastTyped`
seeded (written before it is read), and `creating`/`creatingTag` starting `true` (the
picker's immediate watch writes `false` on mount). Hand-mutating copies against main
settled that `pick()`'s bare-string branch survived there too, so the sheet's "35 of 39"
above was incomplete; call a survivor pre-existing only after running it against main.
That branch turned out to be **dead**, not merely untested: UInputMenu never forwards the
tags input's own add, so a name entered with the list shut became a chip with no Tag
behind it. It is gone; `enterTyped` takes that Enter in the capture phase instead, and
only `e2e/food-tags.spec.ts` can reach it — happy-dom runs no microtask checkpoint between
listeners, so Reka's post-`nextTick` `defaultPrevented` check sees a bubbling
`preventDefault` there that it never sees in a browser.

`TagPicker.vue` scores **72 of 86** before its last two tests, which kill three more (the
Enter flag forced on, and its reset removed). Beyond the two carried over above (the
`signal`, the initial search term), the remaining survivors are:
- **Killed by `e2e/food-tags.spec.ts`:** `enterTyped`'s create call forced off or
  deleted, and the `trim` that decides whether a name was typed. The Vitest layer
  structurally cannot reach them. The spaces-only test pins the `trim`; "a name entered
  with the Tag list closed" pins the create.
- **Equivalent:** `lastSent` seeded, since it is written before it is read.
- **Equivalent:** three mutants that empty `pick`'s `kept` when no Enter is picking.
  They leave `picked = held`, and Reka hands back the held list in the order it was
  given. Forcing `kept` to *all* of `picked` is **not** equivalent. The two-Tag
  take-off test kills it.

`useApiMutation.ts` scores **72 of 80** with the `retry` hook, which is killed. Its
survivors are on lines the hook did not touch.

### Tags on Log — `catalog.ts` 48 of 54, `log.vue` and `TagChips.vue` unattributed

All six `catalog.ts` survivors are **equivalent**. One is `fold`'s `toLowerCase` →
`toUpperCase`, recorded above. The other five are `tagsOnOffer`'s comparator, for two
different reasons. `<` → `<=`, `>` → `>=` and `>` → `true` differ only when two Tags on
offer fold to the same name, and a User cannot hold two: `TagName` is equal to another
ignoring case, and the offer is deduplicated by id. `>` → `false` and `>` → `<=` return
`0` where the original returns `1` for every greater pair — equivalent only because
V8's sort reads nothing but the comparator's sign against zero from below.

`log.vue` (94) and `TagChips.vue` (6) came back entirely `NoCoverage` in this run,
although `log.test.ts` renders both (F16 slice 2's sweep did score `log.vue`, so this
is not a fixed property of the file). A throwaway single-file Stryker config ran no
tests, and the TDD hook refuses a mutant written into `app/`, so they were settled by
hand-mutating **copies** outside it — the page importing its sibling `TagChips` copy
explicitly — and running `log.test.ts` against each: 12 of 12 killed, a clean control
run first. The toggle never clearing, no "All" chip, `aria-pressed` pinned false, the
chips bound to nothing, a Tag not collapsing the page, a Tag not reaching
`narrowFoods`, each of the four heading and empty-message branches, the row shown with
no Tag carried, and the clear button shown for a Tag alone. The one line no test
reaches is the resolved-Tag fallback, which matters only if a catalog refresh drops
the chosen Tag; nothing on `/log` refreshes the catalog while it holds one.

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
  needs an explicit zero case. `AddSheet.vue`'s three are the worked examples, and
  they do not all take the same case: `lookup()`'s `if (!code) return` and
  `barcode.value.trim() || undefined` needed a **whitespace** barcode, while the
  scanned-barcode watcher's `if (!code) return` needed an **empty decode** — the
  scanner clears its own value on restart, so whitespace never reaches it. All
  three were written by hand; no score asked for any of them (#303).
- **`MethodExpression` deletes some built-in calls, which is narrower than it
  sounds.** `trim`, `slice`, `filter`, `sort`, `substring` and `charAt` are removed
  rather than substituted, so a built-in fold that *is* written gets proven
  load-bearing (`AddSheet.vue`'s two `.trim()` calls, #303). It says nothing about
  the fold that is **missing** from the other side of a comparison — there is no
  call node there to mutate — so the skill's one-sided-fold warning holds for
  built-ins exactly as it does for a normaliser you wrote.
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
