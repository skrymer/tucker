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
ssh tucker 'tucker/deploy/update.sh'
```

The script ([`deploy/update.sh`](../../../deploy/update.sh)) is `git pull` +
the prod-overlay rebuild with the compose file pair hardcoded — never run a
bare `docker compose up -d` on the box; without the overlay it drops the
frontend and the tunnel and re-publishes the backend port.

`update.sh` also stamps the build version (`APP_VERSION`/`GIT_SHA`/`BUILT_AT`)
into `.env`, so `/api/version` and the Profile footer report the running build.
**Always deploy through `update.sh`** (or `--no-pull`, below): a bare
`docker compose ... up --build` that skips it would otherwise bake the
`dev`/`unknown` defaults — though now, thanks to the `.env` stamp, a bare rebuild
inherits the *last* `update.sh` stamp rather than resetting to `dev`/`unknown`.

Run it in the background — the build takes 10–20 min on the 1-vCPU box.
**Slow is normal; OOM is not**: the Gradle and Vite stages dip into the 4 GB
swapfile by design. If the build is OOM-killed, check swap is on
(`free -h`) before anything else.

## 3. Verify (curl, not a browser)

A browser is untrustworthy here — a stale service worker can serve the
precached shell and mask both outages and the Access gate. From the local
checkout:

```bash
deploy/verify-prod.sh
```

**Preflight, once per box:** the backend refuses to start without its three Access
settings (ADR 0020), and they have no defaults — so on the first deploy after F10
slice 1, `update.sh` will pull and stamp the new version into `.env` and then die
at `docker compose`, leaving the checkout ahead of what is running. Check before
deploying (counts only, never prints values):

```bash
ssh tucker 'grep -c "^TUCKER_ACCESS_[A-Z_]*=." tucker/.env'   # expect 3
```

If it isn't 3, add them from `deploy/README.md` step 6 first.

The script ([`deploy/verify-prod.sh`](../../../deploy/verify-prod.sh)) exits
non-zero on any failure. It asserts: unauthenticated `/`, `/api/*`, manifest
and SW all **302 to Cloudflare Access** (a 200 = publicly exposed = incident),
the three containers running, and — inside the frontend container, where traffic
never passed through Access and so carries no assertion — same-origin
`/api/foods` returning **401** while `/api/version` returns **200**. Both are
expected: since F10 slice 1 the backend verifies the Access JWT itself (ADR
0020), so a **200 on `/api/foods` there would mean the gate is off** — an
incident, exactly like a 200 on the unauthenticated probes. Do not "fix" that
check back to expecting 200; it would then pass only when the gate is down.
`/api/version` stays open so an operator can tell "the app is down" from "the
app is rejecting me". Its final section prints backend error/exception log lines
from the last 10 minutes — that part is **judged, not asserted**: investigate
anything that isn't known-benign noise before calling the deploy good.

## 4. Report

State old → new commit, the PRs that shipped, each verification result, and
disk/swap state. If any check failed, say so plainly and don't call it
deployed.

## Rollback

`ssh tucker 'cd tucker && git checkout <previous-sha> && deploy/update.sh --no-pull'`
— images aren't tagged per release (yet), so rollback is a rebuild of the
previous commit. `--no-pull` deploys the checked-out SHA as-is (no `git pull` to
drag it back to the branch tip) and **stamps that SHA's version** the same way a
forward deploy does. Return the checkout to `main` (`git checkout main`, then a
normal `update.sh`) once fixed.

## Hard rules

- **Never print secrets** — no `cat .env`, no `TUNNEL_TOKEN`, no echoing the
  Access login URLs' token parameters into reports. Test the token presence
  with `grep -qE "^TUNNEL_TOKEN=.+" .env && echo set`.
- The DB (`tucker-data` volume) is live user data. Nothing in a deploy
  touches it; treat any step that would as out of scope for this skill.
- When GHCR build-and-push lands (ADR 0015's recorded next step), step 2's
  `--build` becomes an image pull — update this skill in the same PR.
