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

This brings up `backend`, `frontend`, and `cloudflared`. Off-host backup
(`litestream`) stays profile-gated and is **not** part of the first deploy
(accepted for a greenfield start — issue #89); enable it later with
`--profile backup`.

> Requires Docker Compose ≥ v2.24.4 (the overlay uses the `!reset` tag).

## First deploy to a VPS

1. **Provision** a small Linux VPS ([ADR 0012](../docs/adr/0012-single-node-self-hosting.md)).
   Building images on the host needs enough RAM for the backend's Gradle/JDK
   build stage — a very small box can OOM there (the documented next step,
   building in CI and pulling from GHCR, removes that).
2. **Install Docker** (Engine + the Compose plugin).
3. **Clone** the repo onto the host.
4. **Configure secrets** — copy `.env.example` to `.env` and fill in
   `TUNNEL_TOKEN` (Cloudflare Zero Trust → Networks → Tunnels → create → copy the
   token). `.env` is git-ignored.
5. **Cloudflare dashboard ingress** (operator step — not in the repo; a token
   tunnel's routing lives in the dashboard): in Zero Trust → Networks → Tunnels →
   your tunnel → **Public Hostname**, route `https://<your-host>` →
   `http://frontend:3000`. One rule, one origin. Add a Cloudflare **Access**
   application over the same hostname so it stays the only auth.
6. **Bring it up**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```
7. **Set the timezone** if the box isn't already in your zone — the engine works
   in the user's local day, so export `TZ` before composing (e.g.
   `TZ=Australia/Brisbane`); see the note in `docker-compose.yml`.

## Verify the install (both viewports)

Over the real HTTPS origin, with DevTools → Application:

- **SPA loads** over HTTPS and `/api/*` works same-origin (no CORS).
- **Manifest + service worker reachable** — confirm Cloudflare Access does **not**
  gate `/manifest.webmanifest` or `/sw.js` (they must load for the install
  criteria; if Access challenges them, add a bypass/service-token path).
- **Installable** — Android Chrome offers install (WebAPK); iOS Safari installs
  via Share → Add to Home Screen.
- **Offline shell** — with the network cut, a reload still renders the app shell
  (the precached `/`), not a white screen.

## Updating a running deployment

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Both images rebuild on the host and the containers recreate. (Building in CI and
pulling from GHCR is the recorded next step in
[ADR 0015](../docs/adr/0015-production-deployment-topology.md), taken when
reproducible promotion or VPS RAM pressure justifies it.)

## Off-host backup (later)

Litestream continuously replicates the SQLite database to S3-compatible storage.
It requires the database in WAL journal mode and the `litestream.yml` credentials
in `.env`; enable with `--profile backup`. Tracked in issue #89.
