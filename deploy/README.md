# Deploying Tucker

Tucker self-hosts on a single node behind a Cloudflare Tunnel + Access
([ADR 0012](../docs/adr/0012-single-node-self-hosting.md)). Production wires the
pieces per [ADR 0015](../docs/adr/0015-production-deployment-topology.md): a
**frontend** container serves the SPA and same-origins `/api` to the **backend**
over the internal compose network; a single **cloudflared** ingress fronts the
frontend; images are built on the host.

```
Internet ── Cloudflare (Access) ──tunnel──▶ frontend:3000 ──/api──▶ backend:8080
                                            (Nuxt SPA + runtime /api proxy)   (SQLite)
```

## Production stack

The base `docker-compose.yml` is dev-friendly (publishes the backend on
`127.0.0.1:8080`, gates the tunnel behind a profile). `docker-compose.prod.yml`
is the overlay that turns it into production — it adds the `frontend` service,
points the tunnel at it, ungates the tunnel, and drops the backend's host port so
nothing binds `8080` on the host. Run everything through both files:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

This brings up `backend`, `frontend`, `cloudflared`, and `litestream` (the prod
overlay ungates off-host backup — see [Off-host backup](#off-host-backup) below;
it needs the `LITESTREAM_*` secrets in `.env`).

> Requires Docker Compose ≥ v2.24.4 (the overlay uses the `!reset` tag).

## First deploy to a VPS

1. **Provision** a small Linux VPS ([ADR 0012](../docs/adr/0012-single-node-self-hosting.md)).
   Pick a region close to the user — every `/api` call round-trips through the
   tunnel to this box. Building images on the host needs RAM headroom beyond the
   running stack: the backend's Gradle/JDK stage and the frontend's Vite stage
   can each peak well over 1.5 GB. A 2 GB box works **only with swap enabled**
   (2–4 GB, e.g. a swapfile) — without it the build stages OOM; 4 GB builds
   comfortably without swap. (The documented next step, building in CI and
   pulling from GHCR, removes this constraint.)
2. **Install Docker** (Engine + the Compose plugin).
3. **Clone** the repo onto the host.
4. **Have a Cloudflare zone** — the tunnel's public hostname and the Access app
   can only attach to a domain in your Cloudflare account. Register one via
   Cloudflare Registrar (at-cost, live immediately) or add an existing domain as
   a free-plan zone and switch its nameservers (propagation wait applies).
5. **Configure secrets** — copy `.env.example` to `.env` and fill in
   `TUNNEL_TOKEN` (Cloudflare Zero Trust → Networks → Tunnels → create → copy the
   token). `.env` is git-ignored.
6. **Cloudflare dashboard ingress** (operator step — not in the repo; a token
   tunnel's routing lives in the dashboard): in Zero Trust → Networks → Tunnels →
   your tunnel → **Public Hostname**, route `https://<your-host>` →
   `http://frontend:3000`. One rule, one origin. Add a Cloudflare **Access**
   application over the same hostname so it stays the only auth:
   - **Policy**: Allow → include only your email.
   - **Login methods**: Google as IdP (one-tap on the phone) plus the built-in
     One-time PIN as fallback.
   - **Session duration: 1 month** (the maximum). An expired session inside the
     installed PWA surfaces as failing `/api` calls until a reload re-runs the
     login redirect — single-user behind a screen-locked device doesn't need a
     daily re-auth dance.
7. **Set the timezone** if the box isn't already in your zone — the engine works
   in the user's local day, so export `TZ` before composing (e.g.
   `TZ=Australia/Brisbane`); see the note in `docker-compose.yml`.
8. **Bring it up**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```

## Verify the install (both viewports)

Over the real HTTPS origin, with DevTools → Application:

- **SPA loads** over HTTPS and `/api/*` works same-origin (no CORS).
- **Manifest + service worker reachable** — while logged in, confirm
  `/manifest.webmanifest` and `/sw.js` return 200. The manifest link is
  credentialed (`pwa.useCredentials` in `nuxt.config.ts`) so the fetch carries
  the Access cookie — everything stays gated; no Access bypass is needed or
  wanted ([ADR 0015](../docs/adr/0015-production-deployment-topology.md)).
- **Installable** — Android Chrome offers install (WebAPK); iOS Safari installs
  via Share → Add to Home Screen.
- **Offline shell** — with the network cut, a reload still renders the app shell
  (the precached `/`), not a white screen.
- **Reminder subscription** — on the installed app, enable the Weekly-Review
  Reminder on `/profile`: the permission prompt appears and a Push Subscription
  is created (the POST succeeds). This is the first run of the subscribe path on
  a real HTTPS origin (dev and smoke ran on localhost). The first actual
  Reminder is a passive check — it arrives at the local reminder hour once a
  review is overdue and the app hasn't been opened that day.

## Updating a running deployment

```bash
deploy/update.sh
```

`git pull` + the prod-overlay rebuild, with the compose file pair hardcoded.
Both images rebuild on the host and the containers recreate. Use this rather than
a bare `docker compose ... up --build`: `update.sh` also stamps the build version
(`APP_VERSION`/`GIT_SHA`/`BUILT_AT`) into `.env` so `/api/version` and the Profile
footer report the running build; a bare rebuild that skips it would bake the
`dev`/`unknown` defaults (it now inherits the *last* stamp from `.env`, but only
`update.sh` advances it). To redeploy an older commit, `git checkout <sha>` then
`deploy/update.sh --no-pull`.

**Versioning.** The root `VERSION` file holds the `major.minor` base (e.g. `0.1`);
`update.sh` derives the patch as the number of commits since `VERSION` last
changed, so the version advances on every deploy (`v0.1.0`, `v0.1.1`, …) with no
manual bump. To start a new line, edit `VERSION` (`0.1` → `0.2`, or `1.0`) — that
commit resets the patch to 0.

(Building in CI and pulling from GHCR is the recorded next step in
[ADR 0015](../docs/adr/0015-production-deployment-topology.md), taken when
reproducible promotion or VPS RAM pressure justifies it.)

## Off-host backup

Litestream continuously replicates the SQLite database to S3-compatible storage so
the user's logged history survives losing the box (Weekly Reviews are irreversible
by design — issue #89). The replica target is **Cloudflare R2** (already on
Cloudflare, no egress fees; B2 or any S3 works identically). Two prerequisites are
handled for you: the backend puts the database into **WAL journal mode** at startup
(`SqliteWalMode`), which Litestream requires, and the prod overlay **ungates** the
`litestream` service so `deploy/update.sh` brings it up. All that's left is the R2
target and credentials.

Because it's ungated, `litestream` comes up on every prod deploy. Until the
`LITESTREAM_*` secrets are in `.env` it can't reach a bucket and simply
restart-loops — harmless to the app (nothing `depends_on` it; `backend` and
`frontend` serve normally), just a noisy container. So provision R2 **before** the
deploy that should start backing up; a deploy in between is safe, it just isn't
replicating yet.

### Provision R2 (one-time operator step)

1. In the Cloudflare dashboard → **R2** → create a bucket (e.g. `tucker-backups`).
2. **R2 → Manage R2 API Tokens → Create API token** (Object Read & Write, scoped to
   the bucket). Copy the **Access Key ID** and **Secret Access Key**, and note your
   **Account ID** (the R2 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
3. Fill the host `.env` (git-ignored — never commit) per `.env.example`:
   `LITESTREAM_BUCKET`, `LITESTREAM_ENDPOINT`, `LITESTREAM_REGION=auto`,
   `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY`.
4. Deploy (`deploy/update.sh`). `docker logs tucker-litestream` should show it
   replicating; objects appear under `tucker/` in the bucket within a minute.

### Restore drill (verify recovery, don't just trust replication)

An untested backup isn't a backup. Confirm a restore yields real data. Restore into
a host directory (this never touches the live `tucker-data` volume):

```bash
# Fresh output dir each run — litestream restore refuses to overwrite -o.
rm -rf restore-check && mkdir -p restore-check
# Pull the latest replica from R2 into ./restore-check/tucker.db. The trailing
# /data/tucker.db is the db key in litestream.yml, NOT a local path it reads.
docker run --rm --env-file .env \
  -v "$PWD/deploy/litestream.yml:/etc/litestream.yml:ro" \
  -v "$PWD/restore-check:/out" \
  litestream/litestream:latest \
  restore -config /etc/litestream.yml -o /out/tucker.db /data/tucker.db
```

Then confirm the user's rows are present. `sqlite3` ships in the Python stdlib, so
a throwaway `python` container needs no host tooling:

```bash
docker run --rm -v "$PWD/restore-check:/db" python:3-slim python -c \
  "import sqlite3; db = sqlite3.connect('/db/tucker.db'); \
   print('entries', db.execute('select count(*) from entry').fetchone()[0], \
         'reviews', db.execute('select count(*) from weekly_review').fetchone()[0])"
```

Counts that match production prove recovery works. Clean up with
`rm -rf restore-check`. Re-run the drill after any change to the backup path or
credentials.
