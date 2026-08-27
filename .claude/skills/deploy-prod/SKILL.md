---
name: deploy-prod
description: Update Tucker's production deployment on the VPS (git pull + pull the images CI published to GHCR, over SSH), then verify the stack, the Cloudflare Access gate, and the same-origin /api path before reporting. Use when the user asks to deploy, ship, release, or update production / the VPS / tucker-diet.com, or after merging a PR that should go live.
---

# Deploy to production

Production is a single VPS (ADR 0012) running the compose prod overlay
(ADR 0015): `backend` + `frontend` + `cloudflared`, no host ports, fronted by
`https://tucker-diet.com` behind Cloudflare Access. **Nothing builds on the box**:
CI publishes both images to GHCR and a deploy pulls the tag for the commit
(ADR 0015). First-time bring-up is
[`deploy/README.md`](../../../deploy/README.md); this skill is the *update*
path for a box already deployed.

**Prerequisite:** the `tucker` SSH alias (key-only login as root, configured in
the operator's `~/.ssh/config`). If `ssh tucker true` fails, stop and ask.

## 1. Preflight

- Confirm `main`'s head is green in CI: `gh run list --branch main --limit 1`.
  A red or still-running main is not just risky here, it is *undeployable*: the
  images are published by the same run, so there is nothing to pull until it
  finishes. `not found` on the pull means exactly that.
- Show what will ship:
  `ssh tucker 'cd tucker && git fetch -q && git log --oneline HEAD..origin/main'`
  (empty → nothing to deploy; report and stop). Record old → new SHAs for the
  report.
- Disk check: `ssh tucker 'df -h / | tail -1'`. If usage > 80%, run
  `ssh tucker 'docker image prune -f'` first — every deploy leaves the images it
  replaced behind, which is what makes `--tag` rollback instant, and they
  accumulate.

## 2. Deploy

```bash
ssh tucker 'tucker/deploy/update.sh'
```

The script ([`deploy/update.sh`](../../../deploy/update.sh)) is `git pull` +
`compose pull` + `up -d`, with the compose file pair hardcoded — never run a
bare `docker compose up -d` on the box; without the overlay it drops the
frontend and the tunnel and re-publishes the backend port.

It takes a minute or two now, not fifteen: the images are already built. The
version stamp is baked by CI, and `update.sh` writes the deployed tag into
`.env` as `TUCKER_TAG`, so a hand-run `docker compose ... up -d` that skips the
script still starts the same images.

Two failure modes, both named by the script itself:

- **`unauthorized`** — the node has no GHCR credential. See "Sign the node in to
  GHCR" in `deploy/README.md`; it is a one-time `docker login`.
- **`not found`** — CI has not published this commit yet, or it went red. Go back
  to the preflight rather than retrying.

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

`ssh tucker 'tucker/deploy/update.sh --tag 0.1.69'` — a retag, not a rebuild:
the image still exists, so going back costs a pull. It leaves the checkout alone
and deploys the artefact that shipped rather than a fresh build of the same
source. `ssh tucker 'grep ^TUCKER_TAG tucker/.env'` says what is running now, and
the GitHub job summary of any green `main` run names the version it published.
Return to the tip with a plain `deploy/update.sh` once the fix is on `main`.

## Hard rules

- **Never print secrets** — no `cat .env`, no `TUNNEL_TOKEN`, no echoing the
  Access login URLs' token parameters into reports. Test the token presence
  with `grep -qE "^TUNNEL_TOKEN=.+" .env && echo set`.
- The DB (`tucker-data` volume) is live user data. Nothing in a deploy
  touches it; treat any step that would as out of scope for this skill.
