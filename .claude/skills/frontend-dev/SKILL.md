---
name: frontend-dev
description: The build-and-test workflow for the Tucker Nuxt frontend (Nuxt 4 + Nuxt UI 4, in frontend/). Use when building or changing ANY frontend functionality — a page, component, composable, util, or its tests. Sets the architecture rules, the styling rule (DESIGN.md's type and shape tokens, by name), the test strategy, and the known gotchas, and routes to tdd, component-testing-best-practices, playwright-best-practices, msw, and feature-sign-off for detail. Look and feel comes from frontend/DESIGN.md and the /design style guide, which this skill points at.
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
- **Style by token name.** Type, shape and colour come from named tokens, never a restated
  value — see [Styling](#styling--read-the-guidelines-then-use-tokens-by-name) below.
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

## Styling — read the guidelines, then use tokens by name

**Before styling a feature**, read `frontend/DESIGN.md` → **Typography** (its *Scale* table) and
**Shape & elevation** — and **Writing & structure** for any copy — and open `/design`
(`app/pages/design.vue`), the rendered style guide, captioned with what each specimen draws.
The values and the reasons live there and in the stylesheet only; this skill names them and
never copies them.

The rule, in the User's terms: **styling is consistent across the app** — every token is used by
name, and no screen restates one inline.

- **Type** — the Scale table's tokens (`text-h2`, `text-body`, `text-eyebrow`, …), never stock
  size and weight classes.
- **Shape** — a card, viewfinder or inset takes `rounded-card` / `rounded-inset`, never a stock
  `rounded-*` step or an arbitrary radius; a card never adds its own padding.
- **Colour** — the Nuxt UI colour roles and `--ui-*`/`@theme` tokens (DESIGN.md → Colour,
  Mapping to Nuxt UI), never hex, and never the only signal (DESIGN.md → Guardrails).
- **A value the scale lacks** — DESIGN.md → Guardrails says how it becomes a token.
- **An action another surface already offers** takes that surface's control: read it and
  copy its shape (variant, icon, placement, how it is named) before building one. #497's
  card shipped an outline "Edit" text button beside Today's ghost pencil for the same
  edit, and undoing it cost a user ruling, four aria baselines and an amended criterion.

The guards below enforce it. A red one means the change broke the rule above: go back to the
token, don't loosen the guard.

| Guard | Fails when |
| --- | --- |
| `app/utils/typeScale.test.ts` → `the type scale` | DESIGN.md's Scale table and `main.css`'s `@theme` disagree |
| `app/utils/typeScale.test.ts` → `using the type scale by name` | a component restates a type token as stock size/weight classes, or an eyebrow isn't muted |
| `app/utils/cardShape.test.ts` → `the card shape` | DESIGN.md's card padding or radii disagree with `app.config.ts` / `main.css` |
| `app/utils/cardShape.test.ts` → `using the shape tokens by name` | any SFC states an arbitrary `rounded-[…]` |
| `e2e/type-scale.spec.ts`, `e2e/card-shape.spec.ts` | rendered sizes, faces, padding or corners drift, or `/design`'s captions do |

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
- **`USkeleton` is a `role="alert"` with `aria-live`** — hardcoded, like `USlider`'s
  "Thumb" below, so every skeleton row announces "loading" and a fast answer still
  alerts. Put the rows in an `aria-hidden` wrapper and let the region's `aria-busy`
  say it is loading (`HistorySection`). Before adopting a Nuxt UI component the app
  has not used, read its `node_modules/@nuxt/ui/dist/runtime/components/*.vue` for
  the roles and aria attributes it sets.
- **`<Transition appear>` does not run for an element mounted with its component
  inside a page's Suspense** — the enter classes never apply, so a delayed reveal
  shows at full opacity from its first frame. Delay it with CSS instead: `.appear-late`
  in `main.css` (#475's skeleton flashed on a 17 ms answer).
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
- **unovis charts** (#519's `RouteTimingCard`): `VisTooltip` throws on unmount under
  happy-dom, so a page test `vi.mock`s it out of `@unovis/vue`, and the bars, labels and
  tooltips are read in Playwright. Its chunk puts an `<svg>` into `<body>` as it loads —
  load a chart lazily (`Lazy…`), or a deep-equal aria snapshot elsewhere changes. A
  grouped bar's tooltip index runs across all bars (`i % layouts` is the series); a long
  axis label wraps into `<tspan>`s (assert with `\s*`); an axis node can be replaced
  between locating and `boundingBox()`, so read positions in one `evaluate`. Four more
  (#522's `ReleaseTrendChart`): a crowded axis wraps a label at every `.`, so `0.1.196`
  stacks three lines high and eats the plot (a fixed `tick-text-width`); a label shown or
  hidden for room fades over 400 ms (`--vis-axis-tick-label-hide-transition`, set `none`
  in the chart's class), reading pale or invisible and freezing in an unfocused tab; a
  point on the plot's edge is nudged inside it, so measure an inset against the step
  between points; and a point outside the y-domain is not drawn at all — count points.
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
- **A token class in a Nuxt UI slot must be named in `ui.tv.twMergeConfig`.**
  tailwind-merge only knows Tailwind's stock names, so a `@theme` class such as
  `rounded-card` in `app.config.ts` sits *beside* the slot's stock `rounded-lg` and
  CSS order picks the winner — #468's cards drew 16px corners past every source test.
  Name it under `extend.theme`, and pin it by measuring the rendered component.
- **A guard that bans a class scans the whole SFC** (`appTemplates()`), not
  `classedElements()`, which sees only static `class="…"` — a bound `:class`, a `:ui`
  string or a script constant walks past it (#468's arbitrary-radius guard).
- **A colour, an opacity or a reveal delay is measured in the mocked e2e, not in
  Vitest** — happy-dom computes no stylesheet (`e2e/calendar.spec.ts`,
  `e2e/type-scale.spec.ts`, `e2e/history.spec.ts`). That includes every visual
  clause of a ruling — "fades in after 150 ms", "not dimmed": #475 pinned its skeleton
  ruling in Vitest alone, and both its fade and its no-dim clause broke past every
  suite. Read a reveal's opacity **at insertion** (a `MutationObserver` in
  `addInitScript`), since by the time a locator resolves the delay is over. Poll it
  (`expect.poll`): a Nuxt UI control with `transition-colors` reads an in-between
  colour right after a click. Measure a size inside an opening modal with `offsetWidth`,
  not `getBoundingClientRect`, which includes the zoom-in transform (#498 read 42.4px
  for a 44px button mid-open). And mind the token names: `bg-inverted` is the
  *inverted background* (dark in light mode); the text on a solid primary fill is
  `--ui-text-inverted`, so a mark that must match it is `bg-(--ui-text-inverted)`.
- **A fix that holds a control on another read creates a new stall.** Disabling Save
  until a read answers holds it for as long as the read hangs — on `/api` that is
  until the proxy gives up (~100 s), where `main` never held it at all. Give that read
  ADR 0007's 8 s `timeoutMs` (`useOptionalFetch` takes one) and treat `timedOut` as a
  failed read that releases the control, red-first, before the user is asked how the
  wait should look (#433's gate 5 rejected the first fix for exactly this).
- **An absence is asserted after something the same read draws.** `toHaveCount(0)`
  passes the instant it is true, so before asserting a read left something out, wait
  for an element that read renders — not the page being up, and not `waitForResponse`,
  which does not wait for Vue to re-render. #518's non-Admin smoke was weak twice
  (Review visible, then the `/api/me` response) until it waited for Profile's "Signed in
  as …", drawn from the same `useMe` read as the Admin item. The mocked-layer form of
  this is in the `msw` skill's REFERENCE.md (an absence-only test).
- **A not-found from a route middleware keeps the previous address.** `abortNavigation`
  on an in-app navigation (Back, a link) leaves the URL of the page you came from,
  while an unknown path's not-found completes the navigation first. Gate a page in its
  own setup (`await ready()`, then throw a fatal 404), and every e2e of a not-found
  page asserts `toHaveURL` beside the body — #518's Back test checked the body only,
  and the walk-through found "Page not found: /admin" under "/". `showError` from the
  middleware is no way out: the navigation clears it (7 of 8 red).
- **`net::ERR_NETWORK_CHANGED` in a local e2e or smoke failure is the host, not the
  code** — Docker creating and removing networks (the smokes' compose up/down) changes
  the host's network under Chrome, and the console guard reports the failed fetch.
  Re-run `--last-failed`; a spec that keeps failing on it is still unproven until CI on
  the PR runs it — "left to CI" is not evidence before that run exists (#523: 84 lines).
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
- **`truncate` does nothing on an `h1`–`h3`.** `main.css` gives headings `text-wrap:
  balance` outside any `@layer`, and an unlayered declaration beats every Tailwind
  utility, so `white-space: nowrap` never applies and the heading wraps. Measure the
  rendered height rather than trusting the class. #434's sheet title wraps for this
  reason, and `ResponsiveOverlay.vue`'s `min-w-0 truncate` on it is inert until the
  rule moves into `@layer base`.
- **A failed `useAsyncData` refresh resets `data` to its default** (`null` here), so
  anything derived from it goes too. #434's Edit sheet closed over the User's unsaved
  edits when a catalog re-read failed. Hold the last value where losing it costs
  something: `computed((last) => read ?? last)`, as `foods.vue`'s `foodToEdit` does.
- **`reka-ui` is pinned to the exact version Nuxt UI resolves**, because
  `ResponsiveOverlay` imports it directly. Bump the two together, or the tree holds two
  copies of Reka.

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
`feature-sign-off` · `backend-dev` (the other half of a vertical slice) · `frontend/DESIGN.md`. ADRs:
[0002](../../../docs/adr/0002-business-logic-belongs-in-the-backend.md) ·
[0003](../../../docs/adr/0003-validate-forms-with-zod.md) ·
[0004](../../../docs/adr/0004-compose-inline-composables.md) ·
[0005](../../../docs/adr/0005-notifications-persistent-errors-quiet-success.md) ·
[0013](../../../docs/adr/0013-test-coverage-policy.md) ·
[0014](../../../docs/adr/0014-client-owns-today.md) ·
[0015](../../../docs/adr/0015-production-deployment-topology.md) ·
[0017](../../../docs/adr/0017-phone-overlays-are-reka-dialog-bottom-sheets.md).
