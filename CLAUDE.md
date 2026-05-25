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
  deterministic. One-time setup: `pnpm exec playwright install chromium`.
- `pnpm test:smoke` — real-stack Playwright tests (no API mocks). Starts
  the backend via `docker compose up backend` and runs the Nuxt SPA
  against it; tests in `e2e/smoke/` must clean up data they create
  (the docker volume persists between runs). One-time setup:
  `docker compose build backend` from the repo root.
- `pnpm lint` / `pnpm lint:fix` — ESLint (`@nuxt/eslint`)
- `pnpm format` / `pnpm format:check` — Prettier

Continuous integration — every pull request runs `.github/workflows/ci.yml`:
the backend `./gradlew detekt` + `./gradlew build`, and the frontend ESLint +
Vitest + Playwright suites. Detekt and ESLint failures fail the build.

Linting and formatting are also enforced locally. ESLint + Prettier run on
staged frontend files via a pre-commit hook — enable it once per clone with
`git config core.hooksPath .githooks`. A Claude Code hook
(`.claude/settings.json`) auto-formats frontend files Claude writes or edits.

The frontend is built **test-first (red-green TDD)**. Increments:

- **F1** — ✅ done. Scaffold, UI testing, and the responsive app shell with
  adaptive navigation.
- **F2** — 🔨 in progress on branch `f2-dashboard`:
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
- **F3** — foods: list, plus manual and barcode-scan creation.
- **F4** — profile, goal, and weight-logging setup screens.
- **F5** — weekly review view + history.
- **F6** — PWA polish: offline shell, install prompt, web-push reminder.

## Architecture

- **Frontend** — Nuxt + Nuxt UI, TypeScript, SPA mode (`ssr: false`). A
  responsive PWA, installable on both mobile (iOS home screen) and desktop
  (Chrome/Edge), via `@vite-pwa/nuxt`. The layout adapts by breakpoint — a
  single-column, touch-first phone layout and a wider desktop layout from one
  codebase. Barcode scanning uses a JS library (iOS Safari has no
  `BarcodeDetector`). The weekly-review reminder uses web push.
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
