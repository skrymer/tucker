# Production deployment topology: a frontend container that same-origins the API

[ADR 0012](0012-single-node-self-hosting.md) fixes *where* Tucker runs — one node, a
VPS, SQLite + Litestream. It does not say *how the pieces are wired on that host*. F6
made the frontend an installable PWA but exposed a gap (issue #88): the
`docker-compose.yml` stack ships a `backend` and a `cloudflared` tunnel but **no
frontend service**, so the Nuxt SPA is reachable nowhere. The PWA install criteria —
manifest + service worker + the app shell, all over one HTTPS origin — make "how is
the frontend served, and how does `/api` reach the backend" a decision worth pinning
before the first deploy. This ADR records it.

## Decision

**The frontend runs as its own container that same-origins the API; production is a
compose overlay; images are built on the host for now.**

- **Frontend container, nitro node server.** The Nuxt build runs as `node
  .output/server` in its own image (a frontend `Dockerfile` mirroring the backend's
  multi-stage build). Not a static `nuxt generate` + nginx — the same-origin proxy
  below needs a server runtime.
- **Same-origin `/api` via a runtime proxy.** A small nitro server route forwards
  `/api/**` to `process.env.TUCKER_API_UPSTREAM` (dev: `http://localhost:8080`; prod:
  `http://backend:8080` over the compose network). Nuxt `routeRules` proxies are baked
  at build time, so the upstream is read at **runtime** instead — one promotable image
  runs in dev and prod, and the dev proxy and prod path converge on one mechanism.
- **One origin, one Cloudflare Access app.** The tunnel has a **single** ingress:
  `https://<host>` → `frontend:3000`. The frontend serves the SPA and proxies `/api`,
  so there is no CORS and Cloudflare Access gates exactly one app. Access remains the
  only auth (single-user, per [ADR 0012](0012-single-node-self-hosting.md)). The PWA
  install-criteria assets stay gated too: the manifest link is credentialed
  (`pwa.useCredentials` → `crossorigin="use-credentials"`, so the browser's
  otherwise cookie-less manifest fetch carries the Access session) — the common
  "add an Access bypass/service-token rule for `/manifest.webmanifest` + `/sw.js`"
  workaround was rejected as an unauthenticated hole in un-versioned dashboard
  config.
- **Production is a `docker-compose.prod.yml` overlay** (mirroring the existing
  `docker-compose.smoke.yml` pattern) layered on the dev base: it adds the `frontend`
  service, wires `cloudflared` to the frontend, and **drops the backend's host
  port-publish** — in prod nothing binds `8080` on the host; only the frontend and the
  tunnel reach the backend over the internal network. Run with
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.
- **CI builds both images and pushes them to GHCR; the VPS only pulls.** Deploy is
  `git pull` + `docker compose pull` + `up -d`, against
  `ghcr.io/skrymer/tucker-{backend,frontend}` tagged with the version, the short SHA and
  `latest`. An image exists for a commit only if that commit's three suites were green,
  so a published tag is a statement about what was tested rather than about what happened
  to compile on the box.

  **This was originally "build on the host for now", with GHCR recorded as the next step**
  once "reproducible promotion or VPS RAM pressure during the JDK build stage justifies
  it". RAM pressure is what came due, and not where it was expected: the JDK stage was
  never the problem. The **Vite** stage was, the day F14's chart landed — `pnpm build`
  aborted with exit 134, a heap-exhausted Node on a 1-vCPU/2 GB box that also serves. The
  deploy failed safe (the build dies before the containers are recreated, so production
  kept serving the previous images), which is the only reason this was a scheduling
  decision rather than an outage.

## Alternatives rejected

- **Tunnel splits the routes** (`/api/*` → backend, rest → frontend, two dashboard
  ingress rules). Pushes routing into Cloudflare-dashboard config that isn't
  version-controlled, and the frontend would do no proxying. Same-origin-via-frontend
  keeps the routing in the repo and the app's existing dev model.
- **Backend serves the SPA** (`nuxt generate` baked into / served by Spring Boot, one
  container). Simplest to *run*, but re-introduces the front/back coupling the project
  deliberately avoids ([ADR 0002](0002-business-logic-belongs-in-the-backend.md) keeps
  the UI swappable) and muddies the build.
- **Build-time proxy target** (bake `TUCKER_API_UPSTREAM` via a build arg). Yields a
  per-environment image that can't run in dev and can't be promoted as the exact
  artifact CI tested. The runtime proxy costs ~15 lines of server code to avoid that.
- **CI → registry → pull as the *first* step.** The right eventual answer, and deferred
  rather than rejected: it adds a publish job, GHCR auth on the host, and tag/version
  discipline, which a greenfield single-operator deploy did not need while a 3-minute
  on-host build handled it. That build grew to ~15 minutes and then stopped fitting at
  all, so the deferral has expired and the decision above supersedes this.

## Consequences

- **The frontend is a server, not static files.** The runtime `/api` proxy depends on
  it; a future move to static hosting (e.g. Cloudflare Pages) would have to relocate the
  proxy to the edge and is therefore a real change, not a swap.
- **The tunnel ingress is dashboard-managed (token tunnel).** Pointing `<host>` →
  `frontend:3000` is a one-time **operator step in the Cloudflare dashboard**, not in
  the repo — the compose file can't express it.
- **The prod overlay is the single source of "what prod adds."** Backend host-port,
  tunnel wiring, and the frontend service live in one readable diff, the base file stays
  dev-friendly.
- **Access session expiry is detected in-app (issue #139).** The installed PWA's
  precached app shell (ADR 0011) serves any navigation from cache, so Access's login
  redirect never gets a chance to run at launch — only the subsequent `/api/*` calls
  hit the gate. A client plugin (`app/plugins/auth-gate.client.ts`) sets
  `redirect: 'manual'` on the `api` client so that interception surfaces as an
  inspectable opaque-redirect response instead of a silent cross-origin failure, and
  switches the whole app to a "You've been signed out" interstitial (DESIGN.md
  Feedback states) whose action forces a real navigation to `/api/version` — a path the
  offline-shell precache always sends to the network — so Access's login challenge
  actually runs. The exits and the prefixes that keep them network-only are one rule,
  kept together and tested in `frontend/app/utils/exits.ts` (#160): `/api/` for this
  sign-back-in path, `/cdn-cgi/` for the sign-out path Access serves at its own edge.
- **Backup is not wired by this ADR.** Off-host Litestream replication (and its WAL
  prerequisite) is deferred to issue #89; the first deploy runs without it (accepted for
  a greenfield start, must land before real reliance).
- **VPS sizing is no longer a build constraint.** The host runs only the JRE and node
  images; nothing compiles there, so a dependency that makes the front-end build heavier
  costs runner minutes rather than threatening the deploy. `docker-compose.prod.yml`
  resets the base file's `build:` stanzas to `null`, so even a hand-run `up -d --build`
  cannot start building on the box.
- **A deploy now needs the registry reachable and the node signed in.** That is one more
  thing between a commit and production, and it fails in two ways that look alike from
  outside — `unauthorized` (the node has no GHCR credential) and `not found` (CI has not
  published this commit, or went red). `deploy/update.sh` names both rather than passing
  Docker's wording through.
- **The version is computed by one script, `deploy/version.sh`, run independently by CI
  and by the node.** CI tags what it computes and the node pulls what it computes; the two
  agreeing is what makes a "not found" a true statement. A change to the formula that
  reached only one of them would be a deploy that can never find its image.
- **Rollback stops being a rebuild.** `deploy/update.sh --tag <version>` retags an image
  that already exists, so going back costs a pull rather than a compile — and it deploys
  the artefact that shipped rather than a fresh build of the same source.
- **The build stamp is baked by CI**, not stamped on the node at deploy time, so what
  `/api/version` and the Profile footer report cannot disagree with the artefact answering
  them.

## References

- [`CLAUDE.md`](../../CLAUDE.md) — Architecture (responsive PWA frontend, Spring/Kotlin
  backend, SQLite/jOOQ, Cloudflare Tunnel + Access).
- [0012 — single-node self-hosting on a VPS](0012-single-node-self-hosting.md) — where
  Tucker runs; this ADR is how the pieces are wired on it.
- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
  — the swappable-UI rationale behind keeping the frontend its own deployable.
- Issues [#88](https://github.com/skrymer/tucker/issues/88) (frontend service — the
  implementation of this ADR) and [#89](https://github.com/skrymer/tucker/issues/89)
  (data backup).
