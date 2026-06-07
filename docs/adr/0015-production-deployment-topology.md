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
  only auth (single-user, per [ADR 0012](0012-single-node-self-hosting.md)).
- **Production is a `docker-compose.prod.yml` overlay** (mirroring the existing
  `docker-compose.smoke.yml` pattern) layered on the dev base: it adds the `frontend`
  service, wires `cloudflared` to the frontend, and **drops the backend's host
  port-publish** — in prod nothing binds `8080` on the host; only the frontend and the
  tunnel reach the backend over the internal network. Run with
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.
- **Build on the host for now; GHCR is the documented next step.** Deploy is `git pull`
  + `docker compose up -d --build`, exactly as the backend builds today — zero new
  secrets, the VPS bootstrap stays "install Docker, clone, up." Building both images in
  CI and pushing to **GHCR** (the VPS then only `pull`s and runs the JRE/node images) is
  the recorded next step, taken when reproducible promotion or VPS RAM pressure during
  the JDK build stage justifies it.

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
- **CI → registry → pull as the *first* step.** The right eventual answer, but it adds
  a publish job, GHCR auth on the host, and tag/version discipline for a greenfield
  single-operator deploy that a 3-minute on-host build handles fine. Recorded as next,
  not now.

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
- **Backup is not wired by this ADR.** Off-host Litestream replication (and its WAL
  prerequisite) is deferred to issue #89; the first deploy runs without it (accepted for
  a greenfield start, must land before real reliance).
- **VPS sizing.** Build-on-host needs enough RAM for the Gradle/JDK build stage; a very
  small box can OOM compiling. The GHCR next-step removes that (the host runs only the
  JRE + node images).

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
