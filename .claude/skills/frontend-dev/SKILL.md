---
name: frontend-dev
description: The build-and-test workflow for the Tucker Nuxt frontend (Nuxt 4 + Nuxt UI 4, in frontend/). Use when building or changing ANY frontend functionality — a page, component, composable, util, or its tests. Sets the architecture rules, the four-layer test strategy, and the known gotchas, and routes to tdd, component-testing-best-practices, playwright-best-practices, msw, and feature-sign-off for detail. This is the build workflow, NOT visual design — for look-and-feel use frontend-design and frontend/DESIGN.md.
---

# Frontend dev (Tucker)

The playbook for any change under `frontend/`. Read it first, build test-first, hand off to
`feature-sign-off` at the end. It **links** the canonical docs (ADRs, DESIGN.md, sibling skills) —
it does not restate them.

## Architecture rules (honour these; the links carry the why)

- **Present, don't compute.** Every derived number and domain verdict comes from the backend API;
  never re-derive a domain rule in Vue. Pure presentation helpers live in `app/utils/`
  (auto-imported); components render API values. (ADR 0002.)
- **Inline composables.** Group each reactive concern into a named `useXxx()` in the same `.vue`
  file; extract to `app/composables/` only on a second consumer. Cross-cutting mutation boilerplate
  lives in the shared `useApiMutation` factory. (ADR 0004.)
- **Forms validate with Zod.** Every `<UForm>` takes a Zod schema — the single source of truth for
  required fields, ranges, and messages, and its inferred type drives the form state. (ADR 0003.)
- **Notifications: persistent retryable errors, quiet success.** Failed mutations surface a
  persistent error toast + Retry (centralised in `useApiMutation`); success is quiet. (ADR 0005.)
- **Style through design tokens, never hex/class hacks.** Nuxt UI colour roles in `app.config.ts` +
  `--ui-*`/`@theme` tokens in `main.css`; colour is never the only signal (icon + text).
  (`frontend/DESIGN.md`.)
- **SPA, same-origin `/api`.** `ssr: false`; a nitro route proxies `/api/**` to the backend; fetch
  client-side via the generated `nuxt-open-fetch` client. After a controller change regenerate:
  `./gradlew generateOpenApiDocs` (in `backend/`) then `pnpm exec nuxt prepare`. (ADR 0015.)
- **The client owns "today".** Send the user's local date to endpoints that resolve a calendar day.
  (ADR 0014.)
- **Doc comments are brief, present-tense, and non-obvious.** A JSDoc/KDoc earns its place by
  saying something the signature doesn't — a rule a reader would otherwise get wrong, a constraint,
  a unit. Skip it entirely when the name already says it (`function formatGrams(g: number)` needs
  no "Formats grams."). Never a changelog: no "used to…" / "previously…" / "changed so…", no
  issue or PR numbers, no narrating the bug that prompted it. Git history and ADRs hold the
  why-it-changed. If the rationale runs past a sentence or two, it belongs in an ADR the comment
  links. No caller inventory either ("Shared by the Day Ring and a Check"): it goes stale the
  first time a caller moves — #471's gate 1 found three — so say *why* it is shared, and leave
  *who* to `git grep`.

## Test strategy — five layers, test-first

| Layer                       | Tool · env                                            | Where                     | Skill                             |
| --------------------------- | ----------------------------------------------------- | ------------------------- | --------------------------------- |
| Pure presentation helpers   | Vitest · env `nuxt`                                   | `app/utils/*.test.ts`     | **tdd**                           |
| Components                  | Vitest · `renderSuspended` + Testing Library          | co-located `*.test.ts`    | **component-testing-best-practices** |
| Nitro server routes         | Vitest · plain, no Nuxt render                        | `server/**/*.test.ts`     | **tdd**                           |
| Rendered behaviour (mocked) | Playwright · Desktop + Mobile Pixel 7, `/api` mocked  | `e2e/*.spec.ts`           | **playwright-best-practices**     |
| Real-stack behaviour        | Playwright smokes vs the Docker backend               | `e2e/smoke/*.smoke.spec.ts` | **playwright-best-practices**   |

The `server/` layer is thin on purpose — the only route is the `/api` proxy — but it is
real production code with a rule of its own (it must never overwrite a Cloudflare Access
assertion with the dev token), and no browser-level layer can reach it.

- **`/api` is mocked with MSW** in both mocked layers — one typed handler set, a baseline
  overridden per test, and no request assertions (the **msw** skill, ADR 0034).
- One test at a time, RED first (the `tdd` skill). A **deep module** (an interface worth
  specifying) gets its own test; thin glue is covered by the integrated / smoke test — never call
  these "isolation tests". (ADR 0013.) An export from `app/utils/` that a second file calls gets
  its own test **in the cycle that exports it**: added later, it passes on write and its red has
  to be shown on a mutant copy (#471's `formatEntryFigures`, which Stryker scored 100% without).
- **Changing what a shared formatter outputs moves tests in every layer.** Before the source
  edit, `git grep` the old wording's *pattern* across `app/`, `e2e/` (with the
  `*-snapshots/*.aria.yml` baselines) and `e2e/smoke/`, and put every hit's new expectation into
  the RED. Once the source is green, Probity refuses reverting it to show a missed test failing;
  the way back is a scratch `git worktree` of `origin/main` with the edited specs copied in (#471
  missed 11 Vitest, 12 e2e and 6 smoke expectations that way).
- Commands (run in `frontend/`): `pnpm test` · `test:e2e` · `test:smoke` · `lint` · `format`.

## Gotchas (each cost a CI / render failure once)

- **Auto-imports** — `app/utils/` + `app/composables/` auto-import; a util is addressed by export
  name, not path, so renaming the file is safe.
- **`useIsDesktop` reads phone (`false`) until its own `onMounted`** — in the browser too, so a
  desktop page is "phone" for its whole `setup`. A sibling `onMounted` registered after it sees the
  real value, but anything a deferred effect captures in that same tick (a `watchEffect` latch)
  can capture the phone default: #435 shipped desktop Check its phone scanner that way, past every
  test. Tests rarely see it — jsdom resolves desktop, and the usual mock
  (`mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))`) is settled before setup. A
  test of code that *captures* the viewport flips a live ref and opens the thing in the same tick
  (`useFullscreenScanner.test.ts`). Drive phone-only branches with an explicit viewport override.
- **`UProgress`** — pass `:model-value` (not `:value`) and clamp it to `:max`; a wrong `:value` is
  silently ignored → an indeterminate bar. Name it with **`:get-value-label`**, never `aria-label`:
  the attribute falls through to UProgress's root `div`, which carries no role, while Reka names the
  `role="progressbar"` element from that prop and *defaults it to the percentage*. So an
  `aria-label` here is silently inert — both Day Ring meters shipped announced as "47%" and "46%"
  with nothing saying which was calories. The percentage is still on `aria-valuenow`, which is where
  a value belongs. Assert through `toHaveAccessibleName` / the aria snapshot, never the attribute.
- **`USlider`** — the same attr-fallthrough trap, but **no such prop**, so the remedy differs: the
  thumb's accessible name is hardcoded to `"Thumb"` and nothing overrides it
  (attr fallthrough lands on the root, which has no role). Wrap it in a `role="group"` labelled
  via `aria-labelledby` at the visible readout, with a **static** id like every other
  `aria-labelledby` in the app. Drive it by keyboard in both layers — `slider.focus()` +
  `user.keyboard('{ArrowRight>20/}')` in Vitest, `locator.press('End')` in Playwright — which
  works without depending on track geometry; assert `aria-valuenow`, not the name.
- **Toast body has a hidden `aria-live` twin** — assert with `getByText(fullMessage, { exact: true })`.
- **Phone overlays are Reka Dialog bottom sheets** (ADR 0017), never Vaul `UDrawer`. While one
  is open the page behind it is `aria-hidden`, so a role locator on that page never resolves —
  measure it by text or CSS. A locator timeout is not a RED.
- **Per-project aria snapshots** (Desktop / Mobile) — after an intended markup change regenerate with
  `pnpm test:e2e --update-snapshots`, then `git diff` the `*-snapshots/` to confirm only the intended
  tree moved.
- **`toMatchAriaSnapshot` is a partial match.** Unlisted nodes are ignored, so every baseline
  opens with `- /children: deep-equal` under its root — without it a snapshot says nothing about
  what is *absent*. State figures exactly, never as `/\d+/`: `--update-snapshots` generalises
  numbers into regexes, so regenerate from `locator.ariaSnapshot()`, which writes literals.
- **Headless Chromium hides scrollbars**, so a layout jump caused by the page's scrollbar
  appearing or disappearing is invisible to e2e. A spec about horizontal position sets
  `test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })` and measures the
  element (`e2e/log-column.spec.ts`). The app keeps the gutter (`scrollbar-gutter: stable`) and so
  runs `UApp` with `:scroll-body="false"` — turn one off and every sheet shifts the column.
- **The format hook rewrites between Edits.** `.claude/hooks/format.sh` runs
  `eslint --fix` after every frontend Write or Edit, so a `let` whose reassignment
  lands in a *later* Edit is turned into `const` first (`prefer-const`), and the test
  fails with "Assignment to constant variable". Write the `let` and its reassignment
  in one Edit.
- **Arrow keys are `.arrow-right` / `.arrow-left` in a Vue key modifier** — `.right`
  and `.left` are the mouse buttons, and the handler silently never fires. In an
  async handler, read `event.currentTarget` before the first `await`: it is `null`
  once the event has finished dispatching (#443's day choice hit both).
- **Keyboard bugs in a Reka component need Playwright.** Some Reka handlers `await nextTick()`
  and then check `event.defaultPrevented` (Reka's `TagsInputInput` on Enter is one). A browser
  runs a microtask checkpoint between listeners, so that check happens *before* an ancestor's
  bubbling `preventDefault` does. happy-dom does not, so it sees the event already prevented. A
  bubbling `@keydown.enter.prevent` therefore passes every component test and still lets Reka
  act in a browser. That is how the Tag picker drew chips that were never Tags. Reproduce in
  `e2e/`, and take the key in the **capture** phase (`@keydown.enter.capture`) to get ahead of
  Reka.
- **`UForm` validates input 300 ms late by default** (`validateOnInputDelay`), and once a
  field has blurred. A form that submits on Enter, loses the field's focus mid-request (the
  phone keyboard's Go does) and empties it on success then shows its own "required" error
  for a field nobody is typing in. `:validate-on-input-delay="0"` fixes it. happy-dom cannot
  see it; the guard is an e2e with an *instant* mock — fill, Enter, `blur()`, wait past
  300 ms, assert the message absent (`e2e/food-tags.spec.ts`).
- **`UInputMenu`** — with `create-item`, it offers no Create item when an existing item matches
  ignoring case, so a typed name of another case picks the existing one. Closing its list clears
  the typed text **100 ms later** (`resetSearchTermOnBlur`), so anything that reads the field
  after the list shuts only works inside that window. An e2e holds it with `page.clock.install()`
  before `goto`, then `page.clock.pauseAt(...)` around the close (`e2e/food-tags.spec.ts`).
- **Adding a query param to a request breaks every `page.route` glob that ends at
  its path** — the smokes still route `/api` that way (an offline abort).
  `**/api/check/123` stops matching `/api/check/123?clientToday=…`, and the spec fails
  as a timeout, not as a routing error. End the glob with `**`, which matches with and
  without a query, and grep `e2e/smoke/` for routes on the path whenever a request
  gains one.
- **Proving a client sends its *local* day belongs in the mocked e2e.** Vitest runs in
  the host's zone and CI in UTC, so an assertion there passes a page that sends the
  UTC date everywhere but a Brisbane morning. The mocked browser runs in
  `MOCKED_E2E_TIMEZONE`; `pinToLocalMorning(page)` (`e2e/support/date.ts`) starts the
  clock at a UTC time where the two days differ and returns the local one. Let the
  handler answer only that day, and assert the product on screen (`e2e/check.spec.ts`,
  `e2e/log.spec.ts`) — never the request's query. It uses `setSystemTime`, so the
  clock keeps running: `setFixedTime` freezes `Date.now`, and a `UInputNumber` then
  never commits what was typed, so a sheet that submits grams refuses them as empty.
  Vitest has the same trap: a test that fakes the clock and submits such a form needs
  exactly `vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })` — faked
  timers, or a `Date` that does not tick, left the submit with zero calls in #443.
- **A colour is measured in the mocked e2e, not in Vitest** — happy-dom computes no
  stylesheet (`e2e/calendar.spec.ts`, `e2e/type-scale.spec.ts`). Poll it
  (`expect.poll`): a Nuxt UI control with `transition-colors` reads an in-between
  colour right after a click. And mind the token names: `bg-inverted` is the
  *inverted background* (dark in light mode); the text on a solid primary fill is
  `--ui-text-inverted`, so a mark that must match it is `bg-(--ui-text-inverted)`.
- **Stale Playwright build** — the mocked e2e rebuilds `.nuxt/e2e` from scratch every run, so it cannot
  serve a stale build; the smokes still build through `@nuxt/test-utils`, so if a UI change doesn't show
  in a smoke run, `rm -rf frontend/.nuxt/test`.
- **Extract Component moves a lifetime, not just code.** What the moved code reads
  once (a day, a clock), owns (a scanner, a canvas) or emits after an `await` now lives
  and dies with the child's `v-if` or `:key`, not the parent's. Compare each against the
  parent before and after. #454 found all three, and both code reviewers called the
  moves behaviour-preserving: a Check that re-read `localToday()` on every mount, a
  scanner canvas rebuilt on every sheet opening, and an `emit` that hit an unmounted
  picker.

## Refactor step — the lint names the smell

`frontend/eslint.config.mjs` (`tucker/refactoring-signals`, `tucker/vue-refactoring-signals`)
fails the build on size and complexity in `app/` and `server/` (tests exempt). Each hit is
a smell; fix it with the catalog move [tdd's `refactoring.md`](../tdd/refactoring.md) names,
chosen to make the code read better — never by shaving lines, and never with an
`eslint-disable`. The commit names the move.

| Rule (limit) | Smell |
| --- | --- |
| `max-lines-per-function` (30) | Long Function |
| `sonarjs/cognitive-complexity` (8), `max-depth` (3), `max-nested-callbacks` (3), `no-nested-ternary` | Nested conditionals |
| `max-params` (4), `vue/max-props` (6) | Long Parameter List |
| `max-lines` (300), `vue/max-lines-per-block` (script 200, template 150), `vue/max-template-depth` (8) | Large Class |
| `no-else-return`, `no-lonely-if`, `sonarjs/no-collapsible-if`, `sonarjs/prefer-single-boolean-return`, `sonarjs/no-inverted-boolean-check` | Nested conditionals (small) |
| `no-param-reassign` | Mutable Data |
| `no-useless-return`, `vue/no-unused-properties`, `vue/no-unused-refs`, `vue/no-unused-emit-declarations` | Dead Code |

How the moves land in Vue (ADR 0004):

- **Large Class → Extract Component**, never a single-consumer composable moved to
  `app/composables/` to save lines: each composable goes with the one child that uses it
  and stays inline there (`CheckAnswer`, `FoodBuilder`, `IngredientPicker`).
- **Long Function → Extract Function**: a long `useXxx()` becomes smaller inline ones; a
  pure step becomes a module-level function. A composable's inner functions count toward
  its length, so a factory splits by concern (`useApiMutation` → its error toast and its
  feedback; `useAsyncAction` → the run's lifecycle and its ownership).
- **A sheet owns the mutation it issues** — a page running every mutation for its
  sheets is Feature Envy. A single-purpose sheet closes itself once it lands; a
  management sheet (`ManageTagsSheet`) stays open. The Food catalog is one
  keyed read every catalog mutation refreshes directly (`useFoodCatalog` /
  `refreshFoodCatalog`); an event passed up through parents that only relay it is a
  Middle Man. `changed` is for data the page alone holds.
- `vue/max-lines-per-block` counts comments; when it fires on a well-commented file the
  answer is still a component boundary, not fewer comments.

## Exit

When the change works and is tested, run **`feature-sign-off`** (verify → simplify →
mutation-test → code-review → check-adrs → resolutions → verify) before committing. Gate 2 is where the tests
themselves get tested: `mutation-test` scopes StrykerJS to the files the change touched,
and every survivor gets one of its four verdicts. A slice that also moved the backend
runs `backend-dev`'s half of that gate in the same pass.

## Related

`tdd` · `component-testing-best-practices` · `playwright-best-practices` · `msw` · `mutation-test` ·
`feature-sign-off` · `backend-dev` (the other half of a vertical slice) ·
`frontend-design` (visuals only) + `frontend/DESIGN.md`. ADRs:
[0002](../../../docs/adr/0002-business-logic-belongs-in-the-backend.md) ·
[0003](../../../docs/adr/0003-validate-forms-with-zod.md) ·
[0004](../../../docs/adr/0004-compose-inline-composables.md) ·
[0005](../../../docs/adr/0005-notifications-persistent-errors-quiet-success.md) ·
[0013](../../../docs/adr/0013-test-coverage-policy.md) ·
[0014](../../../docs/adr/0014-client-owns-today.md) ·
[0015](../../../docs/adr/0015-production-deployment-topology.md) ·
[0017](../../../docs/adr/0017-phone-overlays-are-reka-dialog-bottom-sheets.md).
