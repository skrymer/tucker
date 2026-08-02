# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tucker is a personal, single-user diet tracker — a deterministic web app. The user
logs the food they eat, and the app tracks calories and protein against an
adaptive calorie budget and protein floor, with the goal of losing fat while
retaining muscle.

The domain language is defined in [`CONTEXT.md`](./CONTEXT.md). Read it before
working on anything domain-related, and keep it in sync as the model evolves.

## Status

The **backend is built, tested, and committed** (branch `backend`) — rich domain
model, jOOQ/SQLite persistence, the adaptive weekly-review engine, the full REST
API, a Dockerfile + compose stack, and a unit / integration / e2e test suite.

Backend commands (run in `backend/`):
- `./gradlew build` — compiles, runs Detekt, and runs the fast test suite
- `./gradlew detekt` — Detekt static analysis on its own (also part of `build`)
- `./gradlew e2eTest` — Testcontainers e2e against the Docker image; build it
  first with `docker compose build backend` from the repo root
- `./gradlew generateOpenApiDocs` — boots the app on port 8181 via the
  springdoc Gradle plugin and writes the live OpenAPI spec to
  `frontend/openapi/tucker.json`. Run after any controller change, then run
  `pnpm exec nuxt prepare` in `frontend/` to regenerate the typed
  `nuxt-open-fetch` client.

The **Nuxt frontend** (`frontend/`) is scaffolded — **F1 is done**: a SPA
(`ssr: false`) Nuxt 4 + Nuxt UI + `@vite-pwa/nuxt` project, UI testing wired up,
and a TDD'd responsive app shell with adaptive navigation (bottom tab bar on
phone, side nav on desktop) over four routes: Today, Foods, Review, Profile.

Frontend commands (run in `frontend/`, package manager is pnpm):
- `pnpm dev` — start the dev server
- `pnpm build` — production build
- `pnpm test` — Vitest component / unit tests (`@nuxt/test-utils`, `@vue/test-utils`)
- `pnpm test:e2e` — Playwright browser e2e against a Nuxt build with
  `/api/*` mocked via `page.route` (see `e2e/support/mock-api.ts`); fast and
  deterministic. Every spec runs on two projects, **Desktop Chrome** and
  **Mobile Chrome** (Pixel 7), to flush responsive bugs. One-time setup:
  `pnpm exec playwright install chromium`.
- `pnpm test:smoke` — real-stack Playwright tests (no API mocks). A
  Playwright global setup starts the backend via `docker compose up`
  (layering `docker-compose.yml` + `docker-compose.smoke.yml`,
  `--force-recreate`) and a global teardown `docker compose down`s it;
  the Nuxt SPA runs against it with the same two-project setup as
  `test:e2e`. Isolation is two-layered (issue #70): every **run** gets a
  fresh disposable DB (the override writes SQLite to the container's
  writable layer, off the persistent `tucker-data` volume, so Flyway
  re-migrates an empty DB on recreate), and every **test** is reset to a
  blank slate by an auto fixture that calls a `smoke`-profile-gated
  `POST /api/test/reset` (never in the production bean graph). This is
  necessary because a Weekly Review is irreversible by design — without
  it, reviews created by one test would skew later tests' adaptive
  maintenance. Tests still seed what they need, but nothing leaks between
  tests or runs, and a developer's `tucker-data` is never touched.
  One-time setup: `docker compose build backend` from the repo root.
- `pnpm lint` / `pnpm lint:fix` — ESLint (`@nuxt/eslint`)
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm typecheck` — `nuxt typecheck` (vue-tsc) over the whole program

Continuous integration — every pull request runs `.github/workflows/ci.yml`:
the backend `./gradlew detekt` + `./gradlew build`, the frontend ESLint +
typecheck + Vitest + mocked Playwright suite, and a real-stack `e2e` job that
builds the backend Docker image once and runs both the backend Testcontainers
e2e (`./gradlew e2eTest`) and the frontend smokes (`pnpm test:smoke`) against
it. Detekt, ESLint, and typecheck failures fail the build.

`pnpm typecheck` is CI-only and deliberately **not** in the pre-commit hook
(issue #200). Not for speed — it runs in ~5s, comparable to ESLint — but
because it is whole-program by nature while the hook is staged-file scoped via
`lint-staged`. A type error usually lands in a *different* file from the one
edited (change a component's props, break its test), so a staged-file check
can't express it, and a whole-program check would block committing in-progress
work over errors elsewhere in the tree. CI is where the guarantee has to hold.

**PR walk-through gate.** Before a PR can be merged, drive a feature
walk-through in a real browser using the `claude-in-chrome` MCP tools —
start the dev server, navigate to the changed surface, exercise the
golden path, and probe a couple of edge cases. Walk through **at both
phone and desktop viewports** (resize the chrome window or use DevTools
device mode) — Tucker has a responsive split (bottom-nav vs side-nav,
drawer vs modal, FAB vs header button) and a single-viewport
walk-through misses half the layout. Automated tests can't catch UX
regressions like an overlapping toast or a broken responsive layout;
the walk-through can. Invoke it via the `/verify` skill, which wraps
the protocol and emits a verdict the reviewer can replay.

**Decision-compliance gate.** Alongside the walk-through, run the
`/check-adrs` skill on the change before opening a PR. It verifies the
diff against the project's recorded decisions — the ADRs in `docs/adr/`
and the ubiquitous language in `CONTEXT.md` — extracting each normative
constraint (decision, rejected alternative, MUST/MUST NOT, out-of-scope
ruling, boundary rule, domain term) and emitting a per-constraint
pass/fail/uncertain verdict that cites both the doc line and the code.
The three gates are complementary: `/verify` checks runtime behaviour,
`/code-review` checks correctness, and `/check-adrs` checks that the
implementation honours the decisions already made.

Linting and formatting are also enforced locally. ESLint + Prettier run on
staged frontend files via a pre-commit hook — enable it once per clone with
`git config core.hooksPath .githooks`. A Claude Code hook
(`.claude/settings.json`) auto-formats frontend files Claude writes or edits.

The frontend is built **test-first (red-green TDD)**. Increments:

- **F1** — ✅ done. Scaffold, UI testing, and the responsive app shell with
  adaptive navigation.
- **F2** — ✅ done on branch `f2-dashboard`:
  - ✅ Typed API client — `nuxt-open-fetch`, generated from the committed
    OpenAPI spec (`frontend/openapi/tucker.json`).
  - ✅ Daily-summary dashboard — `DaySummary` component and the `Today` page,
    TDD'd (Vitest component tests + Playwright e2e) and styled with Nuxt UI
    cards, progress bars, and status badges.
  - ✅ Real-stack smoke-test infrastructure — separate Playwright
    `pnpm test:smoke` project that runs against the live backend container
    (`docker compose up backend`); tests live in `frontend/e2e/smoke/`.
  - ✅ Slice 1 — Log Estimated entry end-to-end: `LogEntrySheet` opens a
    responsive overlay (bottom drawer on phone, centred modal on desktop
    via a `useIsDesktop` composable) hosting `EstimatedEntryForm` inside
    a `UTabs` switcher (Weighed tab is a placeholder); on submit it POSTs
    to `/api/entries/estimated`, closes the sheet, and refreshes the
    summary. Verified by a real-stack smoke that opens the sheet, fills
    the form, asserts the entry on the dashboard, and cleans up via the
    API.
  - ✅ Slice 2 — Log Weighed entry end-to-end: `WeighedEntryForm` (food
    picker via `USelectMenu`, grams input, Zod validation, empty-catalog
    CTA) swapped into the Weighed tab; `LogEntrySheet` fetches
    `GET /api/foods` and POSTs to `/api/entries/weighed` on submit.
    Backend computes calories + protein deterministically from the
    food's per-100g values; dashboard reflects the result. Verified by a
    real-stack smoke that seeds a food, logs an entry through the UI,
    asserts the dashboard, and cleans up entry + food via the API. The
    smoke webServer now runs `docker compose up --build backend` so a
    stale image can't mask backend changes.
- **F3** — ✅ done. Foods catalog on `/foods` with view + manual add +
  delete. Slices and sub-tasks:
  - View the catalog (`FoodList` + `FoodListItem`) with a
    `FoodEmptyState` that's also the landing for F2's Weighed-entry
    empty-catalog CTA.
  - Calories derived from macros — Food `caloriesPer100g` is no longer
    user-entered; the domain computes it as `4P + 4C + 9F` via the
    Atwater factors (`Nutrition.fromMacros`). `CreateFoodRequest` drops
    `caloriesPer100g` and requires all three macros; CONTEXT.md
    records the rule.
  - Manually add a food via `AddFoodSheet` (responsive `UDrawer` /
    `UModal`) hosting a Zod-validated `AddFoodForm` (name + three
    macros). Triggers: header button on desktop, FAB on phone, plus
    the empty-state CTA.
  - Delete a food via a row click → `DeleteFoodConfirm` modal.
  - Real-stack smoke for each slice (`foods-list`, `add-food`,
    `delete-food`).
- **F4** — profile, goal, and weight-logging setup screens.
- **F5** — weekly review view + history.
- **F6** — PWA polish: offline shell, install prompt, web-push reminder (PRD
  [#79](https://github.com/skrymer/tucker/issues/79), ADRs 0010–0013). Slice 1
  ([#80](https://github.com/skrymer/tucker/issues/80)) — **installable PWA
  foundation + install affordance** — ✅ done:
  - Icon set derived from the avocado brand mark by a committed
    `frontend/scripts/generate-pwa-icons.mjs` (sharp): 192/512 + an Android
    **maskable** variant, an iOS `apple-touch-icon`, and a monochrome tray badge,
    all on brand green `#00c16a`.
  - Completed manifest + the Workbox **precached app shell** (offline level L1,
    ADR 0011). The `ssr:false` shell is prerendered to `index.html` so `/` is
    precached and an offline navigation falls back to it instead of
    white-screening; `/api/*` is never cached.
  - `usePwaInstall` deep composable (`platform`, `isInstalled`, `canInstall`,
    `promptInstall()`, `iosInstructions`) + an `InstallPrompt` component
    (programmatic button on Android/desktop Chromium, the iOS Share → Add to
    Home Screen hint, nothing once installed), surfaced on `/profile`. Each a
    red-green TDD unit/component test; a real-stack `pwa-install` smoke covers
    manifest + SW + offline shell + the install affordance on both viewports.
  Slice 2 ([#81](https://github.com/skrymer/tucker/issues/81), shipped
  [#92](https://github.com/skrymer/tucker/pull/92)) — **Enable reminders** — ✅ done:
  - `Profile` widened with `timezone` / `reminderHour` / `remindersEnabled` (Flyway
    V3), the per-device `Push Subscription` store, and a self-bootstrapping
    `VapidKeyStore` (V4 `app_config`) exposing the public key.
  - A deep `useWebPush` composable (permission from the gesture, `PushManager`
    subscribe, timezone capture, POST/DELETE) + a `/profile` reminder toggle + hour
    picker, with the iOS install-first hint; each red-green TDD'd, plus an
    `enable-reminders` real-stack smoke.

  Slice 3 ([#82](https://github.com/skrymer/tucker/issues/82), shipped
  [#95](https://github.com/skrymer/tucker/pull/95)) — **Reminder cron + sender**
  (ADR 0010) — ✅ done:
  - Tucker's one `@Scheduled` job, scoped solely to *sending* — it computes nothing;
    the review engine stays lazy. Deep modules (ADR 0013): shared
    `ReviewCadence.isOverdue` (the ≥7-day predicate reused by lazy catch-up and the
    reminder), pure `ReminderPolicy.shouldSend` (enabled / setup / subscribed /
    overdue / absent-today / local-hour gates + per-episode dedupe, resolving "now"
    from the injectable `Clock`), and `SendResult.fromStatusCode`.
  - `WebPushSender` port + `MartijndwarsWebPushSender` (`nl.martijndwars:web-push`);
    `reminder_state` (V6) with `lastSeenOn` (stamped on the daily-summary read, the
    absent-today gate) + `lastReminderSentOn` (dedupe); `ReminderScheduler.runTick`
    (send → prune 410 → stamp) behind one prod-only hourly trigger.
  - Service worker `push` / `notificationclick` handlers (icon + badge + collapse
    `tag`; tap focuses or opens Today at `/`), layered onto the Workbox SW via
    `importScripts`. Real-stack `reminder-send` smoke proves send + dedupe.
    Reminders shipped before [#178](https://github.com/skrymer/tucker/issues/178)
    deep-linked to `/today`, which was never a route; `pages/today.vue` redirects
    those already in a tray to `/`, which stays canonical.
  - Reliability hardening ([#96](https://github.com/skrymer/tucker/issues/96)) — ✅
    done. The dedupe compares a stored local **day** against the review's date (V8)
    instead of re-deriving that day from an instant in the Profile's *current*
    timezone — which is what made it safe to widen the hour gate from "is the
    reminder hour" to a **two-hour window** opening at it, since the dedupe is then
    the only thing holding one nudge per episode. Two hours, not the rest of the day:
    a clock never jumps by more than one, so that is the least that survives a
    spring-forward gap, and an open-ended window would let a nudge owed since
    breakfast land at 23:00. Alongside: an undecodable key is `GONE` (prune) rather
    than retried forever, every send is time-bounded, and the last-seen stamp moved to
    after a *successful* summary read. Reasoning in ADR 0010, "Clocks the rule has to
    survive"; of the two gaps it exposed but does not close,
    [#193](https://github.com/skrymer/tucker/issues/193) is now fixed — the transport
    built a fresh HTTP client per send and closed it from a callback that ran on the
    reactor thread and joined itself, so a *refused* connect stranded that client and
    its `availableProcessors + 1` threads for the life of the process. The sender now
    owns one client, posting the library's own `preparePost` request on it, so the
    per-send close that deadlocked is gone rather than guarded. Still open:
    [#192](https://github.com/skrymer/tucker/issues/192) (only `/` and `/check`
    advance the cadence).

  With slices 1–3 shipped, F6's installable-PWA + web-push reminder is **complete**.
  The Nuxt frontend is **deployed** ([#88](https://github.com/skrymer/tucker/issues/88)
  closed 2026-06-10, ADR 0015): a runtime `/api` proxy
  (`frontend/server/routes/api/[...].ts` reading `TUCKER_API_UPSTREAM`), a frontend
  `Dockerfile`, and a `docker-compose.prod.yml` overlay run on a Brisbane VPS behind
  a Cloudflare Tunnel with an Access app as the only auth; bring-up and verification
  are documented in [`deploy/README.md`](deploy/README.md). On-device install (iOS),
  the offline shell, and the reminder Push Subscription are verified on the real
  HTTPS origin. The missing manifest link that blocked Chromium install was found
  and fixed in [#99](https://github.com/skrymer/tucker/pull/99) (`<NuxtPwaManifest />`
  + credentialed manifest fetch behind Access). Off-host backup
  [#89](https://github.com/skrymer/tucker/issues/89) is **done** — WAL is on and
  Litestream replicates the production DB to R2. Remaining siblings: GHCR
  build-and-push (ADR 0015 next step) and
  [#100](https://github.com/skrymer/tucker/issues/100) (install-button SPA-nav
  timing, ready-for-agent).
- **F7** — Maintenance Mode after a Goal is reached (design pass **done**, see
  [`docs/adr/0008-maintenance-mode-is-the-absence-of-a-goal.md`](docs/adr/0008-maintenance-mode-is-the-absence-of-a-goal.md)
  and the `Maintenance Mode` / reached-Goal / `Drift Status` terms in
  `CONTEXT.md`). Maintenance Mode is **not an aggregate** — it's the *derived
  state of having no active Goal*: Calorie Budget = Maintenance (no deficit),
  Protein Floor still applies (decoupled from the Goal). A Goal is **reached**
  when the live Trend Weight first meets its target; reaching *latches*
  (stamped on Weight-Measurement write, the only moment the trend can cross) and
  is resolved by an **insistent two-way fork** on `/today` — *Switch to
  maintenance* (deactivate) or *Set a lower goal* (replace) — never a silent
  auto-switch. Any Goal lifecycle change (switch, create, replace) force-recomputes
  today's Weekly Review (overwrite) so the Budget lifts immediately
  ([#61](https://github.com/skrymer/tucker/issues/61), shipped with F7). The
  adaptive engine is **unchanged** and keeps
  its weekly cadence (it self-corrects drift even with no deficit). `Drift
  Status` reuses the observed-pace slope classified against a zero rate;
  surfaced (not alerted) on `/today` (a "Maintaining" card replacing
  Goal-Progress) and `/profile` (durable status + "Start a goal" re-entry).
  API: `GET /api/goal` + `/goal/progress` 404 in Maintenance Mode; drift folds
  into the summary response. **Out of scope:** a defended target weight/guard
  band; cause attribution (muscle vs fat) and any lift/training proxy;
  surplus/gaining goals ([#62](https://github.com/skrymer/tucker/issues/62)).
- **F8** — barcode-scan Food creation (deferred from F3; design pass **done**,
  see [`docs/adr/0006-provider-agnostic-nutrition-lookup.md`](docs/adr/0006-provider-agnostic-nutrition-lookup.md)
  and the `Nutrition Provider` / `Food Candidate` terms in `CONTEXT.md`).
  Scan (always `zxing-wasm`, iOS-first) in the Add-Food flow → a single
  discriminated lookup endpoint resolves **catalog hit → existing Food**,
  **provider hit → Food Candidate** (confirmed via the pre-filled `AddFoodForm`),
  or **miss → manual entry with the barcode pre-filled**; manual entry is an
  always-on peer. Providers sit behind a capability-based backend
  `NutritionProvider` port, **operator-chosen** (not user-selectable) ordered
  fallback chain; calories stay Atwater-derived (provider energy is a cross-check,
  not stored). v1 = Open Food Facts only, keyless, online lookup with graceful
  offline→manual fallback, density 1.0. Caching (shared per-barcode) over a
  throttle; the offline catalog cache is deferred to F6. The multi-user
  shared/private catalog split was **rejected** in F10 — every Food is private to
  its owner and the shared per-barcode *lookup* cache carries the dedupe benefit
  ([ADR 0021](docs/adr/0021-every-row-is-owned-by-one-user.md)).
- **F9** — Recipes: a composite Food defined once from ingredient Foods and
  rolled up into per-100g nutrition (**shipped**, PRD
  [#141](https://github.com/skrymer/tucker/issues/141), see
  [ADR 0019](docs/adr/0019-recipe-density-is-a-representative-batch-estimate.md)
  and the `Recipe` term in `CONTEXT.md`). The two weights are the whole idea:
  each ingredient is weighed **as added** (its per-100g must match the form
  weighed in), and the **cooked weight** re-expresses the conserved total per
  100 g — cooking moves water, not calories. Four slices, each shipped with a
  real-stack smoke:
  - Slice 1 ([#142](https://github.com/skrymer/tucker/issues/142)) — create a
    Recipe end-to-end: `POST /api/recipes` with rolled-up nutrition, and the
    recipe builder behind a Food | Recipe switch in the Add sheet.
  - Slice 2 ([#143](https://github.com/skrymer/tucker/issues/143)) — recipes are
    distinguishable in the catalog (ingredient count) with a read-only
    composition view over `GET /api/recipes/{id}`.
  - Slice 3 ([#144](https://github.com/skrymer/tucker/issues/144)) — edit a
    Recipe: recalibrate the cooked weight or change ingredients.
  - Slice 4 ([#145](https://github.com/skrymer/tucker/issues/145)) — deleting a
    Food used as a recipe ingredient is refused, naming what references it (the
    same rule Entries already enforced).

  The builder's live "Per 100 g" is an optimistic client-side preview of
  not-yet-saved input, which the backend re-derives authoritatively on save —
  the carve-out is recorded in
  [ADR 0002](docs/adr/0002-business-logic-belongs-in-the-backend.md).
- **F10** — multiple users (design pass **done**, see
  [ADR 0020](docs/adr/0020-identity-comes-from-cloudflare-access.md),
  [ADR 0021](docs/adr/0021-every-row-is-owned-by-one-user.md), and the `User` term
  in `CONTEXT.md`). Invite-only: Cloudflare Access stays the authenticator and its
  policy is the admission list, while the backend verifies the signed
  `Cf-Access-Jwt-Assertion` (Spring Security resource server) and provisions a
  `User` just-in-time from the email claim. Every row is owned by exactly one User
  with **no sharing**; repositories scope implicitly from the security context, a
  foreign id 404s, and the cron reminder runs-as each User in turn. **Seven**
  slices, one issue each ([#155](https://github.com/skrymer/tucker/issues/155)–[#161](https://github.com/skrymer/tucker/issues/161)):
  the auth gate alone (no `User` yet) → the `User`, provisioned just-in-time, with
  the existing rows backfilled to the owner → scope Foods+Recipes+Entries → scope
  Weight Measurements+Goals+Weekly Reviews → scope Profile+Push+Reminder and run
  the cron as each User → "Signed in as…" + sign out on `/profile` → invite the
  second User. The first two are deliberately separate: the gate can land and be
  verified while every request still behaves byte-for-byte as it does today.
  Slicing is safe in that order because production holds exactly one User until
  the last slice. **Out of scope:** self-service email change (the
  intended design is pending-email adoption, ADR 0020), sharing a Recipe with
  another User (Spring ACL territory, ADR 0021), and public self-signup.
- **F11** — Check: scan a package *before* buying it (**shipped**, PRD
  [#168](https://github.com/skrymer/tucker/issues/168), see
  [ADR 0022](docs/adr/0022-a-check-states-cost-and-return-and-never-labels-a-food.md)
  and the `Check` / `Pace` terms in `CONTEXT.md`). A second use for the scanner,
  on its own nav tab: it states what a portion **costs** (share of the Calorie
  Budget) and what it **returns** (share of the Protein Floor), against **Pace** —
  the `Floor ÷ Budget × 100` g protein per 100 kcal the day must average. Pace is
  derived from the user's own targets, so a deeper deficit tightens it and
  Maintenance Mode eases it. Whole-day framing only (the same product reads the
  same at 9am and 8pm); nothing is saved — no Food, no Entry; gated behind having
  a Calorie Budget, because every figure is a share of one. **Tucker never labels
  a Food good or bad**, and the verdict is protein-only because the app is
  diet-agnostic — both are now standing rules in `CONTEXT.md`. Backend
  `GET /api/check/{barcode}` returns the portion-invariant rules; the client only
  scales by grams. Amends ADR 0006's "one mount point / no new nav tab".
  The camera is the **only** way into a Check — no typed barcode, no manual
  macros, because it produces nothing worth typing for; a denied camera makes the
  tab unavailable. This narrows **nothing** in Add-Food, where manual barcode and
  macro entry remain always-on peers (ADR 0006) — do not harmonise the two.
  **Prerequisite:** [#164](https://github.com/skrymer/tucker/issues/164) — ✅ done:
  with no manual fallback, a provider outage and a genuine miss need opposite error
  messages, so the lookup gained a fourth outcome (an **Inconclusive Lookup**,
  `503`, distinct from a miss's `404`) and both surfaces say which happened.

  Three slices, each shipped with a real-stack smoke:
  - Slice 1 ([#169](https://github.com/skrymer/tucker/issues/169), shipped
    [#173](https://github.com/skrymer/tucker/pull/173)) — scan a package and see
    what it costs and returns.
  - Slice 2 ([#170](https://github.com/skrymer/tucker/issues/170), shipped
    [#177](https://github.com/skrymer/tucker/pull/177)) — dial the portion.
  - Slice 3 ([#171](https://github.com/skrymer/tucker/issues/171), shipped
    [#184](https://github.com/skrymer/tucker/pull/184)) — tell a provider outage
    apart from a genuine miss. An Inconclusive Lookup earns a **"Try again"**
    that re-runs `GET /api/check/{barcode}` against the barcode *already
    decoded* — the camera is not restarted and the decode, which never failed,
    is not repeated. It lives inside that alert's own `actions`, so it
    **structurally cannot** render for a miss (404) or incomplete nutrition
    (422); both are permanent for that product, and "try again" is bad advice
    while standing in a shop. Those two keep only "Scan another", which stays
    available under all three. The Check lookup also passes `retry: 0`: ofetch's
    stock GET retry was silently re-adding the provider-load multiplication the
    backend deliberately refuses (ADR 0007, [#164](https://github.com/skrymer/tucker/issues/164)).
    Proving the retry *is* a retry takes a camera-acquisition count: a restarted
    camera re-decodes the same barcode and issues its own lookup, so request
    counts and a retrying `toBeVisible()` both pass either way.

  **Out of scope:** grading fat or carbs, saving anything, comparing
  products side by side, and "can I fit this in what's left right now?" (that one
  belongs to logging a Food, not shopping for one).
  **Follow-ups:** [#183](https://github.com/skrymer/tucker/issues/183) (a
  superseded `useAsyncAction` run could clear a newer run's spinner) shipped in
  [#196](https://github.com/skrymer/tucker/pull/196), and
  [#182](https://github.com/skrymer/tucker/issues/182) closed the retry
  asymmetry — **both barcode look-ups now pass `retry: 0`**; ADR 0007 records why
  the earlier Check-only scope did not survive. Still open:
  [#197](https://github.com/skrymer/tucker/issues/197) — a newer `useAsyncAction`
  run that inherits a *visible* spinner tears it down with no hold, because
  `shownAt` is scoped to a run while `busy` is scoped to the episode (pre-existing,
  unchanged by #183, most reachable on `/check`).

## Architecture

- **Frontend** — Nuxt + Nuxt UI, TypeScript, SPA mode (`ssr: false`). A
  responsive PWA, installable on both mobile (iOS home screen) and desktop
  (Chrome/Edge), via `@vite-pwa/nuxt`. The layout adapts by breakpoint — a
  single-column, touch-first phone layout and a wider desktop layout from one
  codebase. Barcode scanning decodes client-side with `zxing-wasm` on a single
  code path (iOS is all WebKit — no native `BarcodeDetector`); see F8 and
  ADR 0006. The weekly-review reminder uses web push.
- **Backend** — Spring Boot + Kotlin, REST API. Exposes an OpenAPI spec
  (`springdoc-openapi`); the frontend's API types are generated from it.
- **Data** — SQLite, accessed via jOOQ (type-safe SQL generated from the schema —
  not JPA/Hibernate). Litestream replicates the database file off-host for backup.
- **Hosting** — deployed greenfield to a cheap Docker VPS, reached via Cloudflare
  Tunnel with Cloudflare Access for auth (an Intel N100 mini-PC is the documented
  fallback, never stood up). The frontend runs as its own nitro-node container that
  serves the SPA and same-origins `/api` to the backend; production is a
  `docker-compose.prod.yml` overlay. See
  [`docs/adr/0012`](docs/adr/0012-single-node-self-hosting.md) (where it runs) and
  [`docs/adr/0015`](docs/adr/0015-production-deployment-topology.md) (how the pieces
  are wired). Keep Tucker a well-behaved, resource-limited container.

## Key design decisions

- **Domain-Driven Design — rich domain model.** Behaviour and invariants live in
  the domain objects (entities, value objects, aggregates), not in anemic data
  classes driven by fat services. `CONTEXT.md` is the ubiquitous language. See
  `docs/adr/0001-domain-driven-design.md`.
- **Business logic lives in the backend, not the UI.** Domain rules and derived
  state (e.g. whether a day is on-target) are computed by the backend and
  exposed as plain API fields; the frontend only presents them, keeping the UI
  swappable. See `docs/adr/0002-business-logic-belongs-in-the-backend.md`.
- **Absence on the wire is an explicit `null`, and the spec says so.** A field
  the backend has no value for is serialized as `null`, never omitted, and the
  OpenAPI spec marks it `nullable`, so the generated client reads
  `paceStatus?: string | null` where it used to read `string | undefined` — the
  `null` arm the wire actually carries. The nullability is derived from the
  Kotlin types by a `ModelConverter`, not hand-annotated, so a new nullable DTO
  field is described correctly the day it is written. Only that axis moved:
  responses stay `required`-optional, so an `undefined` arm the API never
  produces remains, and ADR 0023 records why it can't be removed while one
  schema serves both a request and a response. See
  [`docs/adr/0023`](docs/adr/0023-absence-on-the-wire-is-an-explicit-null.md).
- **Forms validate with Zod.** Every frontend form passes a Zod schema to
  Nuxt UI's `<UForm>`; the schema is the single source of truth for required
  fields, ranges, and error messages, and its inferred type drives the form's
  state. See `docs/adr/0003-validate-forms-with-zod.md`.
- **Components compose inline composables.** A component's reactive concerns are
  grouped into small, named `useXxx()` composables — defined inline in the same
  file, or extracted to `composables/` when a second component needs them —
  rather than a flat list of `ref`/`computed`/`watch` in `<script setup>`, which
  then reads as a thin assembly of named concerns. Cross-cutting mutation
  boilerplate lives in the shared `useApiMutation` factory; extracted (shared)
  composables and utils get their own tests, inline ones are covered by their
  component's tests. See
  [`docs/adr/0004-compose-inline-composables.md`](docs/adr/0004-compose-inline-composables.md).
- **Notifications: persistent retryable errors, quiet success.** Failed
  mutations surface a persistent (no auto-dismiss) error toast with a Retry
  action, centralized in `useApiMutation`; a success toast appears only when the
  result isn't already visible at the point of focus (in practice, only "Entry
  logged"). Errors are assertive (`type: 'foreground'`), success is polite
  (`type: 'background'`), and `toaster.max` is 1. See
  [`docs/adr/0005-notifications-persistent-errors-quiet-success.md`](docs/adr/0005-notifications-persistent-errors-quiet-success.md).
- **The core is deterministic.** Calorie and budget math must be exact, instant,
  and free — no LLM in that path. An LLM may later be added *only* as an optional
  input adapter for free-text meal parsing.
- **Adaptive maintenance.** Maintenance calories are seeded from the Mifflin-St
  Jeor formula, then recomputed weekly from the smoothed weight trend and logged
  intake. The Calorie Budget and Protein Floor are recomputed on that weekly
  cadence and held steady in between.
- **Everything is weighed in grams**, liquids included; Food nutrition is stored
  per 100 g. Meals that can't be weighed are logged as flagged estimates.

## Out of scope

WhatsApp-based logging and training-day-aware diet planning were part of the
original concept but are deferred until the core tracker is solid. Do not build
them unless the user asks.
