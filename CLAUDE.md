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
  When a regeneration carries **real** changes inside that churn, keep only the
  structural ones: diff the key-sorted forms (`jq -S .` of the committed spec and
  of the regenerated one) and graft what differs onto the committed file with
  `jq`. Include any `operationId` that moved — adding one method can renumber
  unrelated ones (`delete` / `delete_1` / `delete_2`), and the snapshot test
  compares those too.
- `./gradlew mutationTest` — pitest mutation testing over the fast suite, and the
  backend counterpart to the frontend's `pnpm test:mutation` below: same gate,
  same rules, same **local pre-PR only, deliberately not in CI**. Bare it sweeps
  the whole backend (~17 minutes); scope it to what a change touched —
  `-PmutationTargets='com.tucker.domain.Entry,com.tucker.domain.Entry$*'` — at
  ~0.8s per mutant for domain code and ~1.6s for anything a controller test
  covers, on top of a fixed ~13s coverage pass. Driven by the `/mutation-test`
  skill, gate 2 of `/feature-sign-off`. Why pitest, and what accepting it costs:
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
  `/api/*` mocked; fast and deterministic. `/api` is answered by one typed MSW
  handler set shared with Vitest (`test/mocks/`, ADR 0034, the `msw` skill). Every spec runs on two projects, **Desktop Chrome** and
  **Mobile Chrome** (Pixel 7), to flush responsive bugs. The app is built
  **once** per run and shared: a Playwright `webServer`
  builds `nuxt.config.ts` into `.nuxt/e2e` (`scripts/build-e2e.mjs`) and serves
  it, and every worker reaches it through `nuxt.host`, which switches off
  `@nuxt/test-utils`' own build-per-worker. Locally it runs **4 workers**; the
  before/after measurement sits beside the number in `playwright.config.ts`. One-time setup:
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
  `pnpm exec stryker run --mutate "app/utils/entry.ts"` — at roughly 0.9s per
  mutant. Run it through `scripts/bounded-run.sh`, and **never at the same time as
  the backend sweep**: `systemd-oomd` kills on user-slice memory pressure and takes
  the whole terminal, which it did twice before `concurrency` came down from 4
  (21 GB peak) to 1 (7.3 GB). The measured budget is in the `/mutation-test` skill.
  It is a **local pre-PR gate, deliberately not in CI**: it is far
  slower than the suites CI runs, and every surviving mutant needs a human
  verdict (real gap vs equivalent mutant) rather than a pass/fail threshold. It
  reaches the Vitest layer only — Playwright is out of scope. Driven by the
  `/mutation-test` skill, gate 2 of `/feature-sign-off`; standing verdicts live
  alongside the backend's in
  `.claude/skills/mutation-test/references/known-survivors.md`.
- `pnpm lint` / `pnpm lint:fix` — ESLint (`@nuxt/eslint`)
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm typecheck` — `nuxt typecheck` (vue-tsc) over the whole program

Continuous integration — every pull request runs `.github/workflows/ci.yml`:
the backend `./gradlew detekt` + `./gradlew build`, the frontend ESLint +
typecheck + Vitest + mocked Playwright suite, a real-stack `e2e` job that
builds the backend Docker image once and runs both the backend Testcontainers
e2e (`./gradlew e2eTest`) and the frontend smokes (`pnpm test:smoke`) against
it, and a `hooks` job running `node --test` over the Claude Code hook scripts
in `.claude/hooks/`. Detekt, ESLint, and typecheck failures fail the build.

`pnpm typecheck` is CI-only and deliberately **not** in the pre-commit hook
(issue #200). Not for speed — it runs in ~5s, comparable to ESLint — but
because it is whole-program by nature while the hook is staged-file scoped via
`lint-staged`. A type error usually lands in a _different_ file from the one
edited (change a component's props, break its test), so a staged-file check
can't express it, and a whole-program check would block committing in-progress
work over errors elsewhere in the tree. CI is where the guarantee has to hold.

**PR walk-through gate.** Before a PR can be merged, drive a feature
walk-through in a real browser using the `claude-in-chrome` MCP tools —
start the dev server, navigate to the changed surface, exercise the
golden path, and **probe the inputs the change accepts, at their
boundaries**: a capitalised query, an accented name, whitespace, zero,
one past a cap. Not only the empty and error states — those are states
the app puts itself in, and the bugs live in the values a User puts in.
Walk through **at both phone and desktop viewports** (resize the chrome
window or use DevTools device mode) — Tucker has a responsive split
(bottom-nav vs side-nav, drawer vs modal, FAB vs header button) and a
single-viewport walk-through misses half the layout. Automated tests
can't catch UX regressions like an overlapping toast or a broken
responsive layout; the walk-through can. Invoke it via the `/verify`
skill, which wraps the protocol and emits a verdict the reviewer can
replay — and then has an agent **audit that verdict against the diff**,
since the person choosing the probes is otherwise the person scoring
them. It runs **twice** in `/feature-sign-off` — a one-viewport
reachability pass before the other gates, and this walk-through last,
on the code that ships, because the gates in between change behaviour
every time.

**Decision-compliance gate.** Alongside the walk-through, run the
`/check-adrs` skill on the change before opening a PR. It verifies the
diff against the project's recorded decisions — the ADRs in `docs/adr/`
and the ubiquitous language in `CONTEXT.md` — extracting each normative
constraint (decision, rejected alternative, MUST/MUST NOT, out-of-scope
ruling, boundary rule, domain term) and emitting a per-constraint
pass/fail/uncertain verdict that cites both the doc line and the code.
The three gates are complementary: `/verify` checks runtime behaviour,
`/code-review` checks correctness, and `/check-adrs` checks that the
implementation honours the decisions already made. All three presume the
change is wanted, so `/feature-sign-off` adds a fourth voice that does
not — one agent per run is briefed to argue the change should **not**
merge; see *Keeping the fan-out independent* in that skill for the two
rules that keep the rest of the fan-out independent of the author. A
fifth voice asks the remaining question — not whether the change should
exist, but whether it is **finished**: an **acceptance ledger** reads
the issue and returns one MET / PARTIAL / MISSING / UNSOUND row per
acceptance criterion, an UNSOUND one stopping the sign-off and going to
the user and an issue stating no criteria coming back SKIPPED, which is
a result rather than a failure. Every gate above it is scoped to the
diff as the context that wrote the diff understands it, so a criterion
misread while building is invisible to all of them — the walk-through
included, which then proves the wrong feature works.

Linting and formatting are also enforced locally. ESLint + Prettier run on
staged frontend files via a pre-commit hook — enable it once per clone with
`git config core.hooksPath .githooks`. A Claude Code hook
(`.claude/settings.json`) auto-formats frontend files Claude writes or edits.

The frontend is built **test-first (red-green TDD)**. Increments:

The roster below is one line per increment. **The slice-by-slice record — what
each slice shipped, and the traps, deviations and measurements its sign-off
turned up — is in [`docs/feature-history.md`](docs/feature-history.md).** Read
the entry for a feature before changing it; record a shipped slice there, not
here.

- **F1** — ✅ Scaffold, UI testing, responsive app shell with adaptive navigation.
- **F2** — ✅ Typed API client, Today dashboard, real-stack smoke infrastructure,
  logging Estimated and Weighed Entries.
- **F3** — ✅ Foods catalog on `/foods`: view, manual add (calories Atwater-derived
  from macros), delete.
- **F4** — profile, goal, and weight-logging setup screens.
- **F5** — weekly review view + history.
- **F6** — ✅ Installable PWA, offline shell, web-push Weekly-Review Reminder
  (PRD [#79](https://github.com/skrymer/tucker/issues/79), ADRs 0010–0013); deployed
  (ADR 0015). Open: [#192](https://github.com/skrymer/tucker/issues/192).
- **F7** — ✅ Maintenance Mode after a Goal is reached
  ([ADR 0008](docs/adr/0008-maintenance-mode-is-the-absence-of-a-goal.md)).
- **F8** — ✅ Barcode-scan Food creation
  ([ADR 0006](docs/adr/0006-provider-agnostic-nutrition-lookup.md)).
- **F9** — ✅ Recipes (PRD [#141](https://github.com/skrymer/tucker/issues/141),
  [ADR 0019](docs/adr/0019-recipe-density-is-a-representative-batch-estimate.md)).
- **F10** — ✅ Multiple users, invite-only, every row owned by one User, live in
  production ([ADR 0020](docs/adr/0020-identity-comes-from-cloudflare-access.md),
  [ADR 0021](docs/adr/0021-every-row-is-owned-by-one-user.md)).
- **F11** — ✅ Check: scan a package before buying it (PRD
  [#168](https://github.com/skrymer/tucker/issues/168),
  [ADR 0022](docs/adr/0022-a-check-states-cost-and-return-and-never-labels-a-food.md)).
- **F12** — ✅ Calorie Tracking is optional (PRD
  [#246](https://github.com/skrymer/tucker/issues/246),
  [ADR 0024](docs/adr/0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md)).
- **F13** — a **Weigh-in Reminder**: nudge a User who has not weighed in, rather
  than one who has not opened Tucker. Not designed, not sliced, no issue yet.
- **F14** — ✅ Intake Breakdown on `/review` (PRD
  [#263](https://github.com/skrymer/tucker/issues/263),
  [ADR 0026](docs/adr/0026-an-intake-breakdown-divides-what-was-eaten-never-the-budget.md)).
- **F15** — ✅ Micronutrient Intake (PRD
  [#277](https://github.com/skrymer/tucker/issues/277),
  [ADR 0027](docs/adr/0027-micronutrients-are-borrowed-bounded-and-never-a-target.md)).
- **F16** — ✅ Logging is its own destination (PRD
  [#294](https://github.com/skrymer/tucker/issues/294),
  [ADR 0028](docs/adr/0028-logging-is-its-own-destination.md)).
- **F17** — ✅ Weight Timeline on `/review` (PRD
  [#320](https://github.com/skrymer/tucker/issues/320),
  [ADR 0029](docs/adr/0029-a-weight-timeline-shows-the-body-and-the-intake-behind-it.md)).
- **F18** — ✅ Tags (PRD [#360](https://github.com/skrymer/tucker/issues/360),
  [ADR 0033](docs/adr/0033-a-tag-is-the-users-own-thing-not-a-word-on-a-food.md)).
  Open: [#385](https://github.com/skrymer/tucker/issues/385).

## Architecture

**Architecture diagrams live in [`docs/architecture.md`](docs/architecture.md)**
as Mermaid: the C4 context, container and component levels, the deployment view,
and an ER diagram of the database. Update them in the same change whenever a
module boundary, an external integration, a data flow or the schema changes, and
check the rendered result rather than only the source. Mermaid's C4 renderer
places elements by statement order and wraps rows at the viewer's screen width,
so an edit that still parses can reshuffle a diagram.

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
  **Nothing builds on the box.** CI publishes both images to
  `ghcr.io/skrymer/tucker-{backend,frontend}` — tagged with the version, the short
  SHA and `latest` — and `deploy/update.sh` pulls the tag for the commit being
  deployed, so a published tag exists only for a commit whose four suites were
  green. Building on the host was ADR 0015's original call and it expired the way
  that ADR predicted, though not where: the **Vite** stage, not the JDK one, ran the
  1-vCPU/2 GB box out of heap the day F14's chart landed and aborted the deploy with
  exit 134. It failed safe — the build dies before the containers are recreated —
  which is why that was a scheduling decision rather than an outage. The version is
  computed by one script, `deploy/version.sh`, run independently by CI and by the
  node: CI tags what it computes, the node pulls what it computes, and the two
  agreeing is what makes a `not found` a true statement (CI unfinished, or red)
  rather than a mystery. Rollback is `deploy/update.sh --tag <version>` — a retag of
  an image that already exists, not a rebuild.

## Key design decisions

- **Domain-Driven Design — rich domain model.** Behaviour and invariants live in
  the domain objects (entities, value objects, aggregates), not in anemic data
  classes driven by fat services. `CONTEXT.md` is the ubiquitous language. See
  `docs/adr/0001-domain-driven-design.md`.
- **Business logic lives in the backend, not the UI.** Domain rules and derived
  state (e.g. whether a day is on-target) are computed by the backend and
  exposed as plain API fields; the frontend only presents them, keeping the UI
  swappable. See `docs/adr/0002-business-logic-belongs-in-the-backend.md`.
- **A mutation must prove it came from Tucker's own page.** Access's credential
  is the `CF_Authorization` **cookie**, which a browser attaches by itself and
  Cloudflare turns into the assertion header at the edge — so a cross-site form
  POST arrives fully authenticated. Every state-changing request therefore carries
  a CSRF token, read by page JavaScript out of the `XSRF-TOKEN` cookie and echoed
  in a header, which is the one step a cross-site page cannot take. **Never move
  that read into the `/api` proxy** — it sees the same cookie on the attacker's
  request and would forge the proof for them. **Two ways a stateless resource server
  breaks Spring's stock SPA configuration** are recorded in
  [ADR 0025](docs/adr/0025-a-mutation-must-prove-it-came-from-tuckers-own-page.md),
  both silent and both found by measuring the running image rather than by reading:
  `oauth2ResourceServer` exempts _every_ Tucker request from CSRF via its
  bearer-token override, so enabling CSRF without restoring the matcher protects
  nothing while reviewing as a fix; and the token rotates on every request — there
  being no session, every request re-authenticates — deleting the cookie and
  deferring a replacement nothing materialises, so a client holds a token about half
  the time. Rotation is off (`NullAuthenticatedSessionStrategy`); there is no login
  boundary here to fixate across. The suites carry a **real** token rather than
  `SecurityMockMvcRequestPostProcessors.csrf()`, which would swap the production
  repository out of the shared filter. `CsrfGateTest` fails if the matcher regresses. The
  cookie is `SameSite=Strict` and `Secure`, and `Secure` is **derived, not set**: an
  explicit flag is honoured but would stop every http-speaking test client sending the
  cookie back, so `server.forward-headers-strategy` makes `request.isSecure()` true behind
  the tunnel and the repository's own fallback does the rest. `ApiEndToEndTest` pins both
  branches — and the whole attribute list, since `SameSite=Strict` was pinned by nothing.
  Still open in [#258](https://github.com/skrymer/tucker/issues/258), two Cloudflare
  dashboard settings applied and verified one at a time so a broken sign-in has one
  possible cause: `SameSite=Lax` on `CF_Authorization`, and **HSTS**, which removes the
  plaintext request the cookie overwrite needs as its foothold.
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
  (`type: 'background'`), and `toaster.max` is 1. Those two words only become an
  announcement because the toaster is portalled into a Tucker-owned
  `<div aria-live>` teleported to `body` (`app.vue`) — **don't move it back**:
  inside `#__nuxt` the sheet's overlay paints over the toast and eats its Retry
  click, and without the wrapper an open sheet's `aria-hidden` sweep hides the
  toast while Reka's own (`aria-hidden`) announce region says nothing. See
  [`docs/adr/0005-notifications-persistent-errors-quiet-success.md`](docs/adr/0005-notifications-persistent-errors-quiet-success.md).
- **The core is deterministic.** Calorie and budget math must be exact, instant,
  and free — no LLM in that path. An LLM may later be added _only_ as an optional
  input adapter for free-text meal parsing.
- **Adaptive maintenance.** Maintenance calories are seeded from the Mifflin-St
  Jeor formula, then recomputed weekly from the smoothed weight trend and logged
  intake. The Calorie Budget and Protein Floor are recomputed on that weekly
  cadence and held steady in between — and a review run with **Calorie Tracking**
  off derives none of the three, because a Budget the adaptive correction can
  never reach is a target that can never become true
  ([ADR 0024](docs/adr/0024-a-weekly-review-carries-intake-targets-only-when-they-can-be-corrected.md)).
- **Everything is weighed in grams**, liquids included; Food nutrition is stored
  per 100 g. Meals that can't be weighed are logged as flagged estimates.

## Out of scope

WhatsApp-based logging and training-day-aware diet planning were part of the
original concept but are deferred until the core tracker is solid. Do not build
them unless the user asks.
