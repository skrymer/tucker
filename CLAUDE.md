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
- `pnpm test:smoke` — real-stack Playwright tests (no API mocks). Starts
  the backend via `docker compose up backend` and runs the Nuxt SPA
  against it; same two-project setup as `test:e2e`. Tests in `e2e/smoke/`
  must clean up data they create (the docker volume persists between
  runs). One-time setup: `docker compose build backend` from the repo
  root.
- `pnpm lint` / `pnpm lint:fix` — ESLint (`@nuxt/eslint`)
- `pnpm format` / `pnpm format:check` — Prettier

Continuous integration — every pull request runs `.github/workflows/ci.yml`:
the backend `./gradlew detekt` + `./gradlew build`, and the frontend ESLint +
Vitest + Playwright suites. Detekt and ESLint failures fail the build.

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
- **F6** — PWA polish: offline shell, install prompt, web-push reminder.
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
  throttle; offline catalog cache and the multi-user shared/private catalog split
  are deferred (the latter to F6 and a future multi-user ADR respectively).

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
- **Hosting** — deployed as a Docker container on an Intel N100 mini-PC (Beelink
  S12 Pro) running Ubuntu Server, reached via Cloudflare Tunnel; Cloudflare Access
  provides authentication. The mini-PC is shared with unrelated services (a NAS,
  Jellyfin), so Tucker should stay a well-behaved, resource-limited container.

## Key design decisions

- **Domain-Driven Design — rich domain model.** Behaviour and invariants live in
  the domain objects (entities, value objects, aggregates), not in anemic data
  classes driven by fat services. `CONTEXT.md` is the ubiquitous language. See
  `docs/adr/0001-domain-driven-design.md`.
- **Business logic lives in the backend, not the UI.** Domain rules and derived
  state (e.g. whether a day is on-target) are computed by the backend and
  exposed as plain API fields; the frontend only presents them, keeping the UI
  swappable. See `docs/adr/0002-business-logic-belongs-in-the-backend.md`.
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
