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
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

No `--build`: both images come from GHCR, published by CI
([ADR 0015](../docs/adr/0015-production-deployment-topology.md)), and the overlay
resets the base file's `build:` stanzas so nothing can compile on the box. It
needs `TUCKER_TAG` in `.env` — `deploy/update.sh` writes it, and in practice that
script is what you run. This brings up `backend`, `frontend`, `cloudflared`, and
`litestream` (the prod overlay ungates off-host backup — see
[Off-host backup](#off-host-backup) below; it needs the `LITESTREAM_*` secrets in
`.env`).

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
   - **Policy**: Allow → include only your email. This list is Tucker's *entire*
     admission list ([ADR 0020](../docs/adr/0020-identity-comes-from-cloudflare-access.md))
     — adding a second address to it is the whole of inviting somebody, see
     [Inviting and revoking a User](#inviting-and-revoking-a-user).
   - **Login methods**: Google as IdP (one-tap on the phone) plus the built-in
     One-time PIN as fallback.
   - **Session duration: 1 month** (the maximum). An expired session inside the
     installed PWA surfaces as failing `/api` calls until a reload re-runs the
     login redirect, and a handful of invited people behind screen-locked devices
     don't need a daily re-auth dance. It has one cost, and it is paid on the way
     out: removing somebody from the policy does not end a session they already
     hold, so revoking is two steps rather than one — see
     [Revoke](#revoke).

   Then copy three values from that application into the host `.env`. Access is
   the authenticator, but the backend **verifies its signed assertion itself**
   ([ADR 0020](../docs/adr/0020-identity-comes-from-cloudflare-access.md)), so it
   has to know which team signed it, which application it was minted for, and
   where the keys live:

   | `.env` key | Where to find it | Looks like |
   | --- | --- | --- |
   | `TUCKER_ACCESS_ISSUER` | Zero Trust → **Settings → Custom Pages**, or the top of any Access app — your **team domain** | `https://tucker.cloudflareaccess.com` |
   | `TUCKER_ACCESS_AUDIENCE` | the Access application → **Overview → Application Audience (AUD) Tag** | 64 hex characters |
   | `TUCKER_ACCESS_JWK_SET_URI` | always the team domain + `/cdn-cgi/access/certs` | `https://tucker.cloudflareaccess.com/cdn-cgi/access/certs` |

   None of the three has a default, deliberately: outside production the backend
   verifies against a key committed to this repository, and inheriting that in
   production would let anyone mint themselves an assertion. A **missing** value
   therefore fails at `docker compose` parse time, before a container exists. A
   **wrong** one is quieter — every request 401s — and recovery is redeploying the
   previous image; `/api/version` stays open either way so an operator can tell
   "the app is down" from "the app is rejecting me".

   A fourth key joins them from F10 slice 2 onward, answering a different
   question — not *who signed this* but *whose data is already here*:

   | `.env` key | Where to find it | Looks like |
   | --- | --- | --- |
   | `TUCKER_OWNER_EMAIL` | the address in your Access **policy** — exactly as Access asserts it | `you@example.com` |

   Tucker was single-user before F10, so its database holds years of rows with no
   owner. The `V9` migration creates the first **User** and attributes every one
   of those rows to them, and this is the address it uses. It is read **once**, on
   the deploy that first applies `V9`, and only where there is data to adopt — a
   fresh install has none, so the first person to sign in is provisioned normally.

   Getting it wrong is the one failure worth rehearsing, because it is silent:
   sign-in still succeeds, but the assertion matches no `user` row, so
   just-in-time provisioning creates a **second** User and the app comes up
   looking factory-fresh — no Foods, no history, no Goal — while every Entry,
   Weight Measurement, Goal and Weekly Review stays owned by the first row.
   Nothing is lost and nothing needs restoring; point the owner row at the right
   address and it all reappears:

   The backend image is a plain JRE and carries no `sqlite3` binary, so borrow the
   same throwaway-Python trick the restore drill below uses — `sqlite3` is in the
   Python stdlib, and `--volumes-from` reaches the database without having to guess
   the compose-prefixed volume name:

   ```bash
   docker run --rm --volumes-from tucker-backend python:3-slim python -c \
     "import sqlite3; db = sqlite3.connect('/data/tucker.db'); \
      db.execute('DELETE FROM user WHERE id <> 1'); \
      db.execute('UPDATE user SET email = ? WHERE id = 1', ['the-right@address']); \
      db.commit(); print(db.execute('select id, email from user').fetchall())"
   ```

   Case is not the trap here — `user.email` is `COLLATE NOCASE`, so `You@` and
   `you@` are the same person. Nor is an apostrophe: `.env` is escaped for you
   before Flyway substitutes it, and the `?` parameter above needs no quoting of
   its own — which is exactly why this is written as a bound parameter rather than
   pasted into the SQL.
7. **Set the timezone** if the box isn't already in your zone — the engine works
   in the user's local day, so export `TZ` before composing (e.g.
   `TZ=Australia/Brisbane`); see the note in `docker-compose.yml`.
8. **Sign the node in to GHCR** — one `docker login`, see
   [Sign the node in to GHCR](#sign-the-node-in-to-ghcr-one-time-operator-step)
   below. Without it the first pull fails with `unauthorized`.
9. **Bring it up**:
   ```bash
   deploy/update.sh
   ```
   It computes the version for the checked-out commit, pulls that tag from GHCR
   and starts the stack. A bare `docker compose ... up -d` works too once
   `TUCKER_TAG` is in `.env`, but only `update.sh` puts it there.

## Verify the install (both viewports)

Over the real HTTPS origin, with DevTools → Application:

- **SPA loads** over HTTPS and `/api/*` works same-origin (no CORS).
- **The CSRF cookie is `Secure`** — under Application → Cookies, `XSRF-TOKEN`
  reads `Path=/; Secure; SameSite=Strict`. Worth checking by hand because the flag
  is not configured anywhere: it is derived from the forwarded scheme, so it
  appears only if `X-Forwarded-Proto: https` survives both cloudflared and the
  nitro `/api` proxy
  ([ADR 0025](../docs/adr/0025-a-mutation-must-prove-it-came-from-tuckers-own-page.md)).
  `ApiEndToEndTest` pins the backend's half of that chain against the real image;
  nothing in the repository can see cloudflared's half. If `Secure` is absent the
  cookie is writable by an on-path attacker over plain HTTP, and every suite is
  still green.
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

> **The F10 deploy hold is lifted.** It asked that no deploy land part-way through
> multi-user (issues #155–#161), because ownership is migrated incrementally — each slice
> scopes a few more tables and tightens their `user_id` — so a production database stopped
> between two slices would be genuinely half-migrated. All seven slices and the `NOT NULL`
> follow-up ([#232](https://github.com/skrymer/tucker/issues/232)) are on `main`, and
> `V9`→`V13` applied to production in a single go as the hold intended. Ordinary deploys
> from here.

> **Once, before the first deploy that includes the Access gate:** add the three
> `TUCKER_ACCESS_*` keys from [step 6](#first-deploy-to-a-vps) to the host `.env`. They have
> no defaults, so without them `update.sh` pulls the images and then dies at
> `docker compose` with `required variable TUCKER_ACCESS_ISSUER is missing a value`. The
> running containers keep serving — it is not an outage — but the checkout has moved ahead
> of what is deployed, so fill the keys in and re-run `deploy/update.sh` to converge.

> **Once, before the deploy that carries V13** (issue #232 — `food` and `entry` gain a
> `NOT NULL` owner): run `PRAGMA foreign_key_check` against the production database and
> confirm it comes back empty, using the same throwaway-Python one-liner as
> [step 6](#first-deploy-to-a-vps). V13 rebuilds `food` and re-inserts every Entry and
> ingredient line against it with foreign keys enforced, which validates references that
> have never been checked in bulk — `PRAGMA foreign_keys = ON` only ever checked writes. An
> orphan from an out-of-band edit (that same Python route defaults foreign keys **off**)
> would surface as a failed migration on the next boot rather than staying quiet. It fails
> safe — the transaction rolls back whole and the old schema is intact — but it is much
> better found before the deploy than during it.

> **Once, before the first deploy that includes F10 slice 2:** add
> `TUCKER_OWNER_EMAIL` too, from the same [step 6](#first-deploy-to-a-vps). It fails the
> same way when missing — loudly, at compose-parse time — which is the point: it decides
> who this database's existing history belongs to, and it is far better to be stopped than
> to guess. Check the result afterwards with the throwaway-Python one-liner in
> [step 6](#first-deploy-to-a-vps) (swap the writes for
> `print(db.execute('select id, email from user').fetchall())`): it should report exactly
> one row, carrying your own address.

```bash
deploy/update.sh
```

`git pull`, then pull the images CI published for that commit and recreate the
containers around them — the compose file pair is hardcoded so the overlay can't
be skipped. **Nothing builds on the box any more**
([ADR 0015](../docs/adr/0015-production-deployment-topology.md)): CI pushes both
images to GHCR and the VPS only pulls. `update.sh` writes the tag it deployed into
`.env` as `TUCKER_TAG`, so even a hand-run `docker compose ... up -d` that skips
this script starts the same images rather than something else.

If the pull fails, the script names the two causes, because neither says much on
its own:

- **unauthorized** — this node has never signed in to GHCR (below).
- **not found** — CI has not published this commit yet, or it went red. Check
  `gh run list --branch main --limit 1` before assuming a typo.

**Rolling back is a retag, not a rebuild**, because the old image still exists:

```bash
deploy/update.sh --tag 0.1.69
```

That leaves the checkout alone and deploys the named version as-is. Return to the
tip with a plain `deploy/update.sh` once the fix is on `main`.

**Versioning.** The root `VERSION` file holds the `major.minor` base (e.g. `0.1`);
[`deploy/version.sh`](version.sh) derives the patch as the number of commits since
`VERSION` last changed, so the version advances on every merge (`0.1.0`, `0.1.1`,
…) with no manual bump. To start a new line, edit `VERSION` (`0.1` → `0.2`, or
`1.0`) — that commit resets the patch to 0. CI and the VPS both run that one
script, on their own checkouts: CI tags the images with what it computes and
`update.sh` pulls what *it* computes, which is what makes a "not found" a true
statement rather than a mystery.

### Sign the node in to GHCR (one-time operator step)

The images are pushed by CI under `ghcr.io/skrymer/tucker-{backend,frontend}`.
GHCR packages start **private** even for a public repository, so the node needs a
token before its first pull:

1. Create a classic personal access token with **`read:packages`** only — nothing
   else, since this token lives on the VPS.
2. On the node, with the token on stdin so it never reaches the shell history or
   this file:

   ```bash
   ssh tucker
   read -rs CR_PAT          # paste the token, press enter
   echo "$CR_PAT" | docker login ghcr.io -u skrymer --password-stdin
   unset CR_PAT
   ```

Docker stores the credential in `~/.docker/config.json` and every later
`update.sh` pull uses it. The alternative is making both packages public in the
GitHub package settings, which removes the step entirely — reasonable here, since
the repository is public and the images carry no secrets, but it is a deliberate
choice rather than the default.

## Inviting and revoking a User

Tucker has no signup screen, no admin page and no allowlist of its own. **The
Cloudflare Access policy is the entire admission list**
([ADR 0020](../docs/adr/0020-identity-comes-from-cloudflare-access.md)), and a
verified assertion whose email matches no row provisions a **User** on the spot —
so inviting somebody is one edit in the dashboard, and Tucker never has to be told
it happened.

That is also what makes the policy load-bearing. Because provisioning is
just-in-time, *widening* the policy — a domain rule, a service-token bypass, an
"everyone in the org" include — silently grants Tucker accounts to whoever it now
matches. Keep it a hand-listed set of addresses, and revisit that before any move
toward public signup.

### Invite

1. Zero Trust → **Access controls → Policies** → the Tucker policy → **Configure**
   → add the address to the `Emails` include rule → **Save**. (If the policy was
   created inline on the application rather than as a reusable one, it is reached
   via **Access controls → Applications** → the Tucker app → **Policies**.
   Cloudflare renames this navigation from time to time; the operation is stable,
   the menu path is not.)
2. Send them the URL. They authenticate through Access — Google, or the one-time
   PIN fallback, per [step 6](#first-deploy-to-a-vps) — and the first request
   behind that login creates their User.

Nothing else is required: no deploy, no restart, no `.env` change, no row to
insert. They land on the ordinary first-run empty state — no Foods, no Entries, no
Goal, no history, the setup prompt on Today — because to Tucker a newcomer is
simply a User with nothing logged yet. Their Profile, Calorie Budget, Protein
Floor, Weekly Reviews and reminder schedule are theirs alone from the first
request ([ADR 0021](../docs/adr/0021-every-row-is-owned-by-one-user.md)).

Case is not a trap: the principal converter lowercases the asserted email and
`user.email` is `COLLATE NOCASE`, so `You@` and `you@` are one person.

`TUCKER_OWNER_EMAIL` is **not** involved and must not be touched. It answered a
different, one-off question — who the *pre-F10* history belongs to — and was read
once, on the deploy that applied `V9` ([step 6](#first-deploy-to-a-vps)).

### Revoke

Two steps, in this order, and **both** are needed:

1. **Remove the address from the Access policy** — same place as the invite. This
   stops them logging in again.
2. **Revoke their live session** — Zero Trust → **Team & Resources → Users** →
   select the user → **Action → Revoke → Revoke sessions**. Access clears the
   authorization cookie and every previously issued token stops being accepted
   within 20–30 seconds.

Neither step needs a Tucker deploy, restart or config change.

The order is not cosmetic, and neither step is sufficient on its own:

- **Step 1 without step 2 is not immediate.** Removing somebody from a policy does
  not terminate a session that already exists — they keep the origin until that
  session expires, and Tucker's Access app is deliberately set to the maximum
  **1 month** ([step 6](#first-deploy-to-a-vps)). The backend cannot shorten this
  and should not try: it verifies the assertion Cloudflare mints from that session,
  and an unexpired signature is valid by construction.
- **Step 2 without step 1 buys about a minute.** A revoked User can log straight
  back in while the policy still admits them, and the new login re-provisions
  nothing — their data was never deleted, so they resume exactly where they were.

**Revoking does not delete their data**, and that is the intended behaviour: the
`user` row and everything hanging off it stay put, so re-adding the address returns
that person to their own catalog and history rather than to an empty one. There
is no in-app path to delete a User. If one is ever genuinely needed, note that the
throwaway-Python route used elsewhere in this file defaults foreign keys **off** —
so a bare `DELETE FROM user` there will not be refused, it will quietly orphan
every Food, Entry, Weight Measurement, Goal, Weekly Review, Profile and Push
Subscription that pointed at it. The running app enforces those keys
(`connection-init-sql: PRAGMA foreign_keys = ON`); the recovery shell does not.

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
docker run --rm --user 0:0 --env-file .env \
  -v "$PWD/deploy/litestream.yml:/etc/litestream.yml:ro" \
  -v "$PWD/restore-check:/out" \
  litestream/litestream:latest \
  restore -config /etc/litestream.yml -o /out/tucker.db /data/tucker.db
```

`--user 0:0` is load-bearing: the image runs as a non-root user that cannot write to
a bind mount owned by root, and without it the restore dies with `create temp
database path: open /out/tucker.db.tmp: permission denied`. It has to be the numeric
uid — the image is distroless and has no `passwd` file, so `--user root` fails
differently (`unable to find user root`).

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
