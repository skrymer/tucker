---
name: deploy-prod
description: Update Tucker's production deployment on the VPS (git pull + compose rebuild over SSH), then verify the stack, the Cloudflare Access gate, and the same-origin /api path before reporting. Use when the user asks to deploy, ship, release, or update production / the VPS / tucker-diet.com, or after merging a PR that should go live.
---

# Deploy to production

Production is a single VPS (ADR 0012) running the compose prod overlay
(ADR 0015): `backend` + `frontend` + `cloudflared`, no host ports, fronted by
`https://tucker-diet.com` behind Cloudflare Access. Deploys are
**build-on-host from `main`** — `git pull` + rebuild. First-time bring-up is
[`deploy/README.md`](../../../deploy/README.md); this skill is the *update*
path for a box already deployed.

**Prerequisite:** the `tucker` SSH alias (key-only login as root, configured in
the operator's `~/.ssh/config`). If `ssh tucker true` fails, stop and ask.

## 1. Preflight

- Confirm `main`'s head is green in CI: `gh run list --branch main --limit 1`.
  Never ship a red or still-running main without the user's say-so.
- Show what will ship:
  `ssh tucker 'cd tucker && git fetch -q && git log --oneline HEAD..origin/main'`
  (empty → nothing to deploy; report and stop). Record old → new SHAs for the
  report.
- Disk check: `ssh tucker 'df -h / | tail -1'`. If usage > 80%, run
  `ssh tucker 'docker builder prune -f'` first — on-host builds accumulate
  build cache.

## 2. Deploy

```bash
ssh tucker 'cd tucker && git pull -q && \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build'
```

Run it in the background — the build takes 10–20 min on the 1-vCPU box.
**Slow is normal; OOM is not**: the Gradle and Vite stages dip into the 4 GB
swapfile by design. If the build is OOM-killed, check swap is on
(`free -h`) before anything else.

## 3. Verify (curl, not a browser)

A browser is untrustworthy here — a stale service worker can serve the
precached shell and mask both outages and the Access gate. Probe with curl:

- **Containers**: `ssh tucker 'cd tucker && docker compose -f docker-compose.yml -f docker-compose.prod.yml ps'`
  — all three `Up`.
- **Gate intact** (from the workstation, unauthenticated — expect **302** to
  `*.cloudflareaccess.com` on every path; a 200 means the app is exposed,
  treat as an incident):
  ```bash
  for p in / /api/foods /manifest.webmanifest /sw.js; do
    curl -s -o /dev/null -w "$p -> %{http_code}\n" "https://tucker-diet.com$p"
  done
  ```
- **Same-origin /api in-container** (the frontend image has node, no wget):
  ```bash
  ssh tucker 'docker exec tucker-frontend node -e \
    "fetch(\"http://localhost:3000/api/foods\").then(r => console.log(r.status))"'
  ```
  Expect `200`.
- **Backend log scan**:
  `ssh tucker 'docker logs tucker-backend --since 10m 2>&1 | grep -iE "error|exception" | tail -5'`
  — investigate anything that isn't known-benign noise.

## 4. Report

State old → new commit, the PRs that shipped, each verification result, and
disk/swap state. If any check failed, say so plainly and don't call it
deployed.

## Rollback

`ssh tucker 'cd tucker && git checkout <previous-sha> && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build'`
— images aren't tagged per release (yet), so rollback is a rebuild of the
previous commit. Return the checkout to `main` once fixed.

## Hard rules

- **Never print secrets** — no `cat .env`, no `TUNNEL_TOKEN`, no echoing the
  Access login URLs' token parameters into reports. Test the token presence
  with `grep -qE "^TUNNEL_TOKEN=.+" .env && echo set`.
- The DB (`tucker-data` volume) is live user data. Nothing in a deploy
  touches it; treat any step that would as out of scope for this skill.
- When GHCR build-and-push lands (ADR 0015's recorded next step), step 2's
  `--build` becomes an image pull — update this skill in the same PR.
