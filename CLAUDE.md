# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tucker is a personal diet tracker — a deterministic web app. Each User logs the
food they eat, and the app tracks calories and protein against an adaptive
calorie budget and protein floor, with the goal of losing fat while retaining
muscle. It is **multi-user by invitation but never social**: a User is admitted
by an operator adding their address to the Cloudflare Access policy, every row
belongs to exactly one User, and nothing is shared between them (F10,
[ADR 0020](docs/adr/0020-identity-comes-from-cloudflare-access.md) and
[ADR 0021](docs/adr/0021-every-row-is-owned-by-one-user.md)). "Personal" is
about the scale and the shape of the product, not about it holding one person.

The domain language is defined in [`CONTEXT.md`](./CONTEXT.md). Read it before
working on anything domain-related, and keep it in sync as the model evolves.

## Communicating back to the user

Answer in a brief **tl;dr** style: the outcome first, in as few lines as it
takes. A couple of sentences or a short bullet list is the target, not a
report. Skip the preamble, the recap of what was asked, and the narration of
steps whose result is already visible. Prose that lands in a terminal, not a
document.

Detail is earned, not default — add it when it changes what the user does
next: a failure and its output, a decision they need to make, a caveat that
would bite them later. State those plainly and stop. The thoroughness belongs
in the work (commit messages, ADRs, `CONTEXT.md`), not in the chat reply.

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
  `nuxt-open-fetch` client. Forgetting is caught rather than shipped:
  `OpenApiSnapshotTest` compares the committed snapshot against the spec the
  backend serves on every build, and fails naming both the differing paths and
  those two commands (issue #209). It compares parsed JSON by path rather than
  as text: the two documents are produced by two different JVM runs, nothing
  makes those enumerate controllers and schemas in the same order, and JSON key
  order carries no meaning — so a textual diff would be free to go red over a
  document that says exactly the same thing. That is **observed, not theoretical**:
  a `--rerun-tasks` regeneration swaps `400` against `404` under `responses` on
  most paths — ~700 lines of textual churn that a structural comparison of the two
  documents reports as identical. Discard such a diff rather than committing it.
- `./gradlew mutationTest` — pitest mutation testing over the fast suite, and the
  backend counterpart to the frontend's `pnpm test:mutation` below: same gate,
  same rules, same **local pre-PR only, deliberately not in CI**. Bare it sweeps
  the whole backend (~17 minutes); scope it to what a change touched —
  `-PmutationTargets='com.tucker.domain.Entry,com.tucker.domain.Entry$*'` — at
  ~0.8s per mutant for domain code and ~1.6s for anything a controller test
  covers, on top of a fixed ~13s coverage pass. Driven by the `/mutation-test`
  skill, gate 3 of `/feature-sign-off`. Why pitest, and what accepting it costs:
  [ADR 0013](docs/adr/0013-test-coverage-policy.md); the noise filters it needs
  and why each is there: `backend/build.gradle.kts`. The sweep scores **92%
  (81/1011 unkilled)**, and each of those 81 already has a verdict in
  `.claude/skills/mutation-test/references/known-survivors.md` — read it before
  triaging, and re-litigate an entry only if the code under it moved.

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
- `pnpm test:mutation` — StrykerJS mutation testing over the Vitest suite:
  rewrites the source one mutant at a time and re-runs the related tests, so a
  surviving mutant is a line no assertion pins. Bare, it mutates the whole
  frontend (minutes); in practice it is scoped to the files a change touched —
  `pnpm exec stryker run --mutate "app/utils/entry.ts"` — at roughly 0.7s per
  mutant. It is a **local pre-PR gate, deliberately not in CI**: it is far
  slower than the suites CI runs, and every surviving mutant needs a human
  verdict (real gap vs equivalent mutant) rather than a pass/fail threshold. It
  reaches the Vitest layer only — Playwright is out of scope. Driven by the
  `/mutation-test` skill, gate 3 of `/feature-sign-off`; standing verdicts live
  alongside the backend's in
  `.claude/skills/mutation-test/references/known-survivors.md`.
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
- **F10** — multiple users (**shipped and live**, all seven slices; see
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

  Slice 1 ([#155](https://github.com/skrymer/tucker/issues/155)) — **the auth gate
  alone** — ✅ done. `/api/**` needs a verified assertion; `/api/version` and
  `/v3/api-docs/**` stay open — and the servlet ERROR *dispatch*, matched on dispatcher
  type rather than on `/error`, so an error on one of those two reports its own status
  instead of a 401 without opening a third door. `/api/test/**` is **not** permitted — it stays
  `smoke`-profile-only and its callers carry an assertion like everything else.
  Missing, expired, tampered, foreign-key, wrong-audience, wrong-issuer and
  **email-less** assertions each 401 — the last excluding Cloudflare *service*
  tokens, which authenticate a machine and so have nothing to be a User.
  - **One verification path everywhere** (ADR 0020): production points
    `NimbusJwtDecoder` at Cloudflare's team JWKS, everything else at the committed
    non-production JWK set in `backend/src/main/resources/access/`. Only the key
    *source* differs — same signature check, same validators, same failure modes.
  - **Nothing shipped can mint.** The private half lives in `dev/access-key/`,
    outside every packaged tree; Gradle hands it to the test classpath only. Kotlin
    tests mint in-process, the smokes mint with `jose`, and `pnpm dev` attaches a
    pre-minted `TUCKER_DEV_ACCESS_TOKEN` (from `frontend/scripts/mint-dev-token.mjs`)
    in the `/api` proxy — a static string, not a signing capability.
  - The ~180 existing MockMvc call sites are **untouched**: one
    `MockMvcBuilderCustomizer` signs every test request in with a real token minted
    per request, so the whole suite runs through the real decoder rather than a
    verification-skipping post-processor.
  - `tucker.access.issuer` / `.audience` / `.jwk-set-uri` have **no defaults** — a
    backend given none refuses to start — and the prod overlay supplies all three
    with compose's `${VAR:?}`, so a production deploy that forgets them fails at
    parse time instead of inheriting a key that is committed to a public repo.
    Dashboard locations are in [`deploy/README.md`](deploy/README.md) step 6.

  Slice 2 ([#156](https://github.com/skrymer/tucker/issues/156)) — **the `User`,
  provisioned just-in-time, with the existing rows backfilled** — ✅ done.
  `user(id, email UNIQUE COLLATE NOCASE)`, and `AccessPrincipalConverter` — the
  `JwtAuthenticationConverter` slice 1 left a seam for — is the single home of
  provisioning, resolving every verified assertion to a `TuckerPrincipal(userId,
  email)`. **Nothing is scoped yet**: queries still ignore `user_id`, which is safe
  because production holds one User until [#161](https://github.com/skrymer/tucker/issues/161).
  - **`user_id` is nullable, and that is forced, not sloppy.** SQLite refuses to add
    a `NOT NULL` column carrying a `REFERENCES` clause to a table **that already has
    rows** — and *only* then. A `NOT NULL` V9 therefore passes every test, every
    smoke and the jOOQ codegen schema, and fails against exactly one database in the
    world: the production one. So the FK lands now and `NOT NULL` rides along with the
    per-user-uniqueness rebuilds ADR 0021 already requires. (V9's comment prices those
    rebuilds at `executeInTransaction=false` plus `PRAGMA foreign_keys = OFF`; slice 4
    showed that is the *general* recipe and wrong for these tables, which nothing
    references — see ADR 0021, "What a rebuild actually costs". V9 is applied and so
    left as written.) `OwnerBackfillMigrationTest` is the guard: it migrates
    to V8, seeds the schema the way a real installation is filled, and only then
    migrates forward, **with foreign keys enforced** — the only shape of test that
    can see this at all.
  - **Eight owned tables, not nine.** `recipe_ingredient` is owned *through* its
    Recipe (a Recipe is a Food row): it cascades away with it and every query already
    reaches it through a Food, so a `user_id` there would be a second copy of a fact
    nothing keeps in agreement. `app_config` stays global.
  - **The owner is named by an undefaulted Flyway placeholder** (`${ownerEmail}` ←
    `TUCKER_OWNER_EMAIL`), mirroring `tucker.access.*`: a value that must be right and
    cannot be guessed is better as a boot failure than a wrong default. The row is
    inserted **only where there is data to adopt**, so a fresh install seeds no
    phantom owner and its first visitor is provisioned normally. Getting it wrong is
    silent — the app looks factory-fresh while the history sits under an unmatched
    row — so `deploy/README.md` step 6 carries the one-line fix.
  - **Provisioning resolves its own race in SQL** (`ON CONFLICT DO NOTHING`), because
    the exception handler it replaced could never have worked: jOOQ raises its own
    `IntegrityConstraintViolationException`, *not* Spring's `DuplicateKeyException`,
    so a catch written against the Spring hierarchy compiles, reads correctly and
    never fires — and two devices a newcomer opens together would 500.
  - AC7 (a `SecurityContext` in the ~8 direct-bean test classes) is deliberately
    **deferred to [#157](https://github.com/skrymer/tucker/issues/157)**: nothing reads
    the principal until queries are scoped, so a context installed now would be
    asserted by no test. The isolation suite lands there too, driven RED first.

  Slice 3 ([#157](https://github.com/skrymer/tucker/issues/157)) — **the catalog and
  log become private** — ✅ done. Foods, Recipes and Entries read and write against a
  constructor-injected `CurrentUser` (`SecurityContextHolder` at call time, loud
  `NoCurrentUserException` — its own type, since `IllegalStateException` would arrive
  dressed as a 409). No repository signature carries an owner, so there is no id to get
  wrong.
  - **Two of the holes were live, not theoretical**, and the isolation suite fails on
    both when the predicates come off: `EntryController` deleted by primary key with no
    scoped read in front of it, so one User could delete another's Entry outright; and
    the adaptive engine's window aggregates were unscoped, so a second User's logged
    days and calories set your Maintenance — a leak that shows no wrong name, only a
    wrong number. `FoodRepository.update` was a third in waiting: `applyFrom` writes
    `user_id`, so a key-only UPDATE would not merely overwrite a foreign Food, it would
    silently **re-own** it. Note the engine is only **half** scoped after this slice:
    its *intake* is per-User now, but the fallback it holds when coverage is thin —
    `reviews.latestBefore`, `profiles.get`, `weights.findAll` — is not, so a second
    User below the floor would still hold somebody else's Maintenance. That half is
    slice 4's, and is why [#161](https://github.com/skrymer/tucker/issues/161) is last.
  - **Status codes agree on purpose** (ADR 0021 Consequences). A foreign Food and an
    absent one both delete as **204** — delete is idempotent and always was, so a 404
    for the foreign case would be exactly the existence oracle the ADR forbids. A
    Recipe ingredient naming a Food the caller does not have is now **404** rather than
    400, matching `POST /api/entries/weighed`, which resolves a `foodId` out of a
    request body the same way; 400 keeps malformed input alone.
  - **V10** makes `food.barcode` unique per User — a plain `DROP INDEX` +
    `CREATE UNIQUE INDEX`, because `idx_food_barcode` was a *named* index. It surfaced a
    latent build bug: `prepareJooqDatabase` sorted migrations by **name**, and `"V10__"`
    sorts before `"V1__"` (`'0'` < `'_'`), so codegen ran the tenth migration first
    against an empty database. Sorted by parsed version now; Flyway was never affected,
    which is why it went unnoticed for nine migrations.
  - **Direct-bean tests sign in with `@WithTuckerUser`** — Spring Security's own
    `@WithSecurityContext` hook, whose factory is a bean that *provisions* the User so
    the foreign key has a row to point at. It defaults to `AccessTokens.EMAIL`, which is
    load-bearing: several tests seed through a repository and read back over HTTP, and
    those must be the same person. Opt-in per class, because an ambient identity would
    also reach the cron scheduler and make slice 5's `runAs` untestable.
  - **AC 8 is met by construction, not by a guard.** No cross-owner reference can exist:
    V9 backfilled every legacy row to one User, and scoped ids stop the API making a new
    one. Its wording was lifted from ADR 0021's argument *against* the shared catalog.
    The `referencesFood` / `recipesUsingIngredient` predicates are still there as
    belt-and-braces, and are commented as such rather than as reachable guards.
  - **Half-answered by slice 4**: `SecurityContextHolderFilter` clears
    `SecurityContextHolder` in a `finally`, so a `@WithTuckerUser` class is signed in only
    until its first MockMvc call, and a line after it that reads a scoped repository fails
    naming the repository rather than the request. That is now fixed for every class at
    once — `AccessTestAuthConfig.keepTheTestThreadSignedIn` wires up Spring Security's own
    `exportTestSecurityContext()`, which restores from the second ThreadLocal
    `TestSecurityContextHolder` keeps and the filter's clear does not reach. `SummaryApiTest`
    gained the annotation alongside it; `PushApiTest` still carries none and passes only
    because push is unscoped, so it needs one the moment slice 5 scopes it.

  Slice 4 ([#158](https://github.com/skrymer/tucker/issues/158)) — **the body and the plan
  become private** — ✅ done. Weight Measurements, Goals and Weekly Reviews are owned rows,
  scoped from the security context like the catalog and the log before them. This is where
  multi-user stops being a privacy feature and becomes a correctness one: until here the
  adaptive engine derived one Trend Weight from two people's scale readings and corrected
  one Maintenance from two people's intake, producing a Calorie Budget wrong for both.
  - **Three more live holes, each silent.** `WeightMeasurementRepository.save` looked a date
    up unscoped, so a second person weighing in on a day found the first person's row and
    **overwrote their reading**; `deactivateAll` cleared *every* active Goal, so one person
    starting a Goal dropped another into Maintenance Mode having decided nothing; and a
    review is idempotent **by date**, so an unscoped lookup never collided at all — it
    handed the second person the first's trend weight, Maintenance, Budget and Floor under
    their own name. `latestBefore` did the same for the held-Maintenance fallback, which is
    the half of the engine slice 3 left unscoped.
  - **V11 corrected what a rebuild actually costs.** `measured_on` and `reviewed_on` carry
    *column-level* `UNIQUE`, whose backing `sqlite_autoindex` cannot be dropped, so that
    constraint can only move per-User by rebuilding the table. ADR 0021 priced every rebuild
    at `executeInTransaction=false` plus `PRAGMA foreign_keys = OFF`; **neither is needed
    here**. That is the general 12-step recipe, whose step 1 disables foreign keys so that
    dropping a table does not strand rows in tables that *reference* it — and nothing
    references these. The rule is "does anything reference this table?", not "is this a
    rebuild?", so foreign keys stayed enforced and V11 ran inside Flyway's transaction like
    any other migration. `PerUserUniquenessMigrationTest` walks the reference graph, so the
    premise fails loudly the day a new table points at one of them rather than being quietly
    assumed — and it covers `profile` and `reminder_state`, which slice 5 still owes.
  - **An unowned row is adopted, never deleted**, guarded on there being exactly one User.
    The first version deleted them, on the reasoning that an unowned row is invisible to
    everybody — true of Foods and Entries, scoped in slice 3, and false of these three,
    which *this* slice scopes. Deploy slice 3, use Tucker for a week, deploy slice 4, and it
    would have destroyed every reading since, the active Goal, and Weekly Reviews the project
    calls irreversible. With no User or several, attribution would be a guess, so nothing is
    adopted and the new `NOT NULL` refuses the migration inside a transaction that rolls back
    whole — a boot failure a human resolves, rather than a deletion nobody can undo.
  - **`runAs` came forward from [#159](https://github.com/skrymer/tucker/issues/159).**
    Scoping reviews breaks the hourly reminder, which runs on a cron thread with no security
    context — so one system-level `UserRepository.findAll()` (the `user` table is not
    user-owned) now drives a loop giving each User their own turn through the *same* scoped
    repositories a request uses. `ReminderScheduler` holds only the loop and the per-User
    failure isolation; `UserReminder` does one User's turn. A turn that throws is logged
    naming whose it was and contributes nothing, rather than ending the tick for everyone
    who sorts after them. `RunAsCallSitesTest` pins `runAs` to that single call site and
    says in its own failure message that a second one changes the ADR first.
  - **AC8 was read against the endpoints that exist.** It asked for 404 on a foreign Weight
    Measurement or Goal "by id"; there is no `GET /api/weight/{id}` or `/api/goal/{id}`, and
    the only by-id endpoint across the three aggregates is `DELETE /api/weight/{id}`, which
    has always answered **204** for an unknown id. Per ADR 0021's rule — a foreign id answers
    exactly as an absent one — it answers 204 for a foreign one too, or the status code
    becomes the existence oracle the ADR forbids. Both sides are pinned by tests.
  - **Known intermediate state, unreachable in production**: the Profile, the Push
    Subscriptions and the reminder state stay global until slice 5, so with two Users a nudge
    would fan out to every device in the installation and one User opening Tucker would
    silence everybody's. Recorded in `UserReminder`'s KDoc and in ADR 0010, which had asked
    to be re-checked at exactly this point.

  Slice 5 ([#159](https://github.com/skrymer/tucker/issues/159)) — **the Profile and the
  reminder become one person's** — ✅ done. The Profile, the Push Subscriptions and the
  reminder bookkeeping are owned rows, which closes the three gaps slice 4 wrote down and
  makes the Weekly-Review Reminder per person, as ADR 0010 always specified: this User's
  Profile resolves the timezone and hour, this User's absence opens the gate, this User's
  dedupe closes it, and the nudge reaches this User's devices alone. `ReminderScheduler`
  and `UserReminder` needed no change — the work landed entirely behind the repositories,
  which is what slice 4's split was for.
  - **Three shared rows, three different ways of being wrong.** One `profile` meant one
    answer to "how big is this person": a second User was already set up, from a body that
    is not theirs, and either of them saving `/profile` silently edited the other's. One
    `reminder_state` meant one absent-today day and one dedupe, so somebody opening Tucker
    stood down everybody's nudge and the first send of a tick spent everybody's episode.
    One device list meant every nudge fanned out to every device in the installation.
  - **V12 rebuilds all three**, in Flyway's transaction with foreign keys enforced, on
    ADR 0021's "does anything reference this table?" rule. `profile` loses `CHECK (id = 1)`
    and `reminder_state` gains a per-User unique index; `push_subscription` needs no
    widening and is rebuilt only so that every table the slice scopes ends it with a
    `NOT NULL` owner — V11's rule for `goal`. Unowned rows are **adopted, never deleted**,
    guarded on there being exactly one User, because it is *this* slice that scopes the
    repositories reading them.
  - **`push_subscription.endpoint` stays globally unique, deliberately.** A Web Push
    endpoint names one browser profile on one machine, so re-subscribing one another User
    holds **reassigns** the device rather than failing, and its reminders follow whoever
    opted in last. That is the one unscoped read in the slice; `deleteByEndpoint` *is*
    scoped, and the asymmetry is the point — subscribing is a claim only the newest opt-in
    can settle, unsubscribing is a User forgetting a device of theirs.
  - **Every migration assertion was mutation-checked** rather than assumed green: adoption
    against a delete, the fidelity assertions against a dropped column, the endpoint's
    uniqueness against a dropped `UNIQUE`, and the refusal against a missing one-User
    guard. Same for the scoping predicates, each removed in turn to confirm the test that
    names it goes red.
  - **The fudged test is un-fudged.** Slice 4's "every User gets a turn" reached "up to
    date" by *inserting a review*, because the honest way — opening Tucker — would have
    tripped the shared last-seen stamp. It is now #159's actual criterion, reached the
    honest way, and four more cover fan-out, two timezones, per-User dedupe and device
    reassignment.
  - **Residue, recorded in ADR 0021 rather than fixed here**: `food` and `entry` were left
    carrying a nullable `user_id`. `NOT NULL` only ever rode along with a rebuild a slice
    needed anyway, and slice 3 scoped those two with an index swap. Closed by
    [#232](https://github.com/skrymer/tucker/issues/232), after slice 6 — see below.

  Slice 6 ([#160](https://github.com/skrymer/tucker/issues/160)) — **"Signed in as…" and
  Sign out** — ✅ done, and it is the *entire* user-visible surface of multi-user: one
  byline under the `/profile` h1, on no other page. No account screen, no user switcher,
  no avatar — Access runs the login, so there is nothing for Tucker to offer.
  - **`GET /api/me` → `{ email }`**, the one piece of identity the client is given.
    `/api/me` rather than `/api/user` though every other path is a domain noun: a User can
    only ever ask about themselves (ADR 0021), so the path names the caller instead of
    inviting the question of *which* User. The id stays off the wire — it is a surrogate
    key (ADR 0020) and every scoped endpoint already resolves the owner from the assertion,
    so nothing has one to send. `CurrentUser` gained `email` rather than the controller
    reading `@AuthenticationPrincipal`, keeping one principal-reading path in main source
    and its loud `NoCurrentUserException`.
  - **The byline is a byline, not a seventh section.** `/profile` already carries six, and
    identity attributes the page rather than being another thing on it (DESIGN.md — "spend
    boldness in one place"). It leads rather than sitting in the footer with the install
    prompt and build tag, because "whose diet am I looking at?" is the question the slice
    exists to answer and six sections of scrolling is a bad way to answer it. Muted
    neutral, never the error red: being signed out *unexpectedly* is a fault, choosing to
    leave is not.
  - **The service worker would have eaten it.** `navigateFallbackDenylist` exempted only
    `/api/`, so in the installed PWA — Tucker's primary target — a navigation to
    `/cdn-cgi/access/logout` would have been answered from the precached shell (ADR 0011)
    and silently re-rendered Tucker as the same person. `/cdn-cgi/` is Cloudflare's edge
    namespace (not just the one logout path) and is now exempt too. The same trap was
    already understood in the *sign-in* direction: `SignedOutState` points at
    `/api/version` precisely because it is denylisted.
  - **That rule is now executable, which it was not.** It had been prose in three files
    that never referenced each other, and deleting the prefix left the entire suite green —
    every test asserts the *href*, which stays correct while the navigation silently stops
    working. `app/utils/exits.ts` holds the two exits and the prefixes as one thing,
    `nuxt.config.ts` imports the prefixes rather than restating them, and `exits.test.ts`
    fails if any exit is not covered. The same move `RunAsCallSitesTest` makes on the backend.
  - **`wrap-anywhere`, not `break-words`.** As a flex item the address span's floor is its
    min-content width, and CSS excludes `overflow-wrap: break-word` from that calculation —
    so the class that *looked* like the wrap fix left a long address overflowing the line.
    Measured in a real browser at a 320px column: `break-words` renders 354px wide (34px of
    overflow), `wrap-anywhere` renders 320px and wraps.
  - **One vocabulary for the session boundary.** The app said "Signed in as…" in
    `TuckerPrincipal`'s KDoc and the issue, and "You've been logged out" / "Log back in" in
    `LoggedOutState` and DESIGN.md. An action keeps its name across a flow and this boundary
    is crossed both ways, so the dissenter was harmonised to **sign in / sign out**. The
    rename reaches the identifiers too — `SignedOutState`, `isSignedOut`, `markSignedOut` —
    because a reader arriving from `IdentityByline` would otherwise meet both vocabularies
    in one hop, which is the thing having a single one is for.
  - **AC2's "and ends the session" is not covered by any suite here, and that is stated
    rather than papered over.** `/cdn-cgi/access/logout` is served by Cloudflare's edge, so
    it exists only on the deployed origin and 404s in `pnpm dev` and every smoke. The tests
    assert the *destination*; the outcome is verifiable on the real origin alone, which the
    F10 deploy hold puts out of reach until [#161](https://github.com/skrymer/tucker/issues/161).
    Everything up to that edge *is* covered: `identity.smoke.spec.ts` drives the real gated
    backend through the SPA's same-origin proxy, and asserts two real assertions get two
    different addresses — the one thing a mocked `/api/me` can never prove.

  Follow-up [#232](https://github.com/skrymer/tucker/issues/232) — **every owned table
  enforces its owner** — ✅ done, after slice 6 and before [#161](https://github.com/skrymer/tucker/issues/161).
  V13 rebuilds `food` and `entry` so `user_id` is `NOT NULL`, which is the last of
  ADR 0021's ownership that lived only in the repositories.
  - **`food` was thought to need the foreign-key dance, and does not.** Both this file and
    ADR 0021 priced its rebuild at `PRAGMA foreign_keys = OFF` plus
    `executeInTransaction=false` — a failure part-way leaving production half-migrated with
    no rollback, and referential integrity off process-wide for the life of the JVM. The
    premise was measured before it was accepted: with foreign keys on, `DROP TABLE food`
    fails outright while `entry` still references it, and the `PRAGMA` inside a transaction
    is confirmed a no-op. But that is a fact about **order**. V13 parks `food`'s two
    children in constraint-free holding tables, drops them, and only then drops `food` — a
    parent of nothing by that point — so the ordinary case ADR 0021 already sanctioned is
    *reached* rather than circumvented. The whole migration runs inside Flyway's transaction
    with foreign keys enforced, so there is no non-transactional window to document a
    recovery for. The ADR's rule is restated to match: not "does anything reference this
    table?" but "can everything that references it be rebuilt alongside it?".
  - **The rollback claim is the assertion that matters, and it discriminates.** V13 drops
    `entry` and `recipe_ingredient` *before* the INSERT it can fail on, so at the moment of
    refusal the log and every Recipe's composition exist only inside the transaction.
    Replaying V13 statement by statement in autocommit leaves both tables gone and
    `food_new` behind — which is what the refusal test asserts against.
  - Unowned rows are **adopted, never deleted**, as in V11 and V12 — but for a new reason.
    These two were scoped in slice 3, so the "invisible to everybody" argument that made
    deletion tempting is finally true of them; it is also moot, because an unowned Food may
    still be referenced by an Entry or an ingredient line, and both of those edges refuse
    the delete.
  - **The two adoption sides masked each other, and the first fix made it worse.** Seeding
    both an unowned Food and an unowned Entry in one refusal test reads as thorough and
    costs the test its point: with either row able to refuse the migration, dropping the
    *Food*'s one-User guard is still caught by the Entry, and vice versa. It is two tests,
    each with exactly one unattributable row. Every assertion was mutation-checked, and that
    is what caught it — along with a rebuild that could preserve every foreign-key edge
    while silently changing what one *does* (`ON DELETE CASCADE` stripped from
    `recipe_ingredient.recipe_id`), and a `CREATE UNIQUE INDEX` whose deletion dropped an
    ADR 0021 decision out of the schema with the whole suite still green.
  - One CHECK is **uncatchable rather than uncovered**: `entry`'s `kind IN ('WEIGHED',
    'ESTIMATED')` is subsumed by the table-level shape CHECK, whose two branches each pin
    `kind` to one of those values, so no row can violate the first alone. Said in the test
    rather than faked with a row that violates two constraints at once.

  Slice 7 ([#161](https://github.com/skrymer/tucker/issues/161)) — **invite the second
  User** — ✅ done, **and with it F10**. It is the one slice that could not merge on CI:
  it needed the Cloudflare dashboard, a real deploy, and a second person with a real
  address, so its acceptance criteria are observations against the live origin rather
  than tests. `V9`→`V13` applied to production in a single go, preceded by the
  `PRAGMA foreign_key_check` pre-step (clean) and a Litestream restore drill whose
  restored row counts matched production exactly.
  - **The second User was provisioned just-in-time and owns nothing of the first's.**
    Adding their address to the Access policy was the whole of inviting them; their first
    open created the `user` row. Confirmed on the live origin: an empty Foods catalog, no
    Entries, no history.
  - **The evidence worth keeping is the same-day weight row.** Both Users now hold a
    Weight Measurement on the *same date*, both intact. That is precisely the hole slice 4
    closed — `WeightMeasurementRepository.save` used to resolve the date unscoped, so the
    second person weighing in on a day would silently overwrite the first's reading — and
    `idx_weight_measurement_user_day` on `(user_id, measured_on)` is what lets both exist.
    A production database is the only place that collision was ever going to be real.
  - **Each Calorie Budget derives from one body.** The two Users' Maintenance, Budget and
    Protein Floor were re-derived by hand from their own profiles and trend weights and
    match what the engine stored, against a formula seed of Mifflin-St Jeor × 1.4 and a
    floor of 2.0 g/kg. Before slice 4 one engine averaged both people's scale readings and
    logged intake into a single Maintenance, which was wrong for both.
  - **Reminders reach one person's devices.** The two Push Subscriptions sit on different
    push services (FCM and Apple), the timezone is captured onto the enabling User's
    Profile alone, and `reminder_state` keeps a separate absent-today stamp and dedupe per
    User. **A live send was not observed**: `ReminderPolicy` requires a review ≥7 days
    overdue *and* the User absent that day, so with both Users active and freshly reviewed
    every gate is correctly shut. The send-and-dedupe path is covered by the
    `reminder-send` real-stack smoke instead.
  - **AC5 (revoke) was not exercised**, by choice — it locks the second User out of a
    live account to prove a Cloudflare behaviour rather than a Tucker one. The procedure
    and why it takes two steps are documented; see below.
  - **Revocation is two steps, not one, and the issue's AC says one.** Removing an address
    from the Access policy does not end a session that already exists — Cloudflare only
    re-evaluates the policy at login — so a revoked person keeps the origin until their
    session expires, which Tucker's Access app sets to the maximum **1 month**. Their live
    session has to be revoked separately (Zero Trust → Team & Resources → Users → Action →
    Revoke). The reverse order is no better: revoking alone buys about a minute, because a
    policy that still admits them lets them log straight back in. AC5's "revokes access
    immediately" holds only for both steps together; `deploy/README.md` documents the pair
    and why each is insufficient alone. The "without a deploy" half of that AC is
    unaffected — neither step touches Tucker.
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
