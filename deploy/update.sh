#!/usr/bin/env bash
# Update Tucker's production stack. Runs ON the VPS, from any directory:
#
#   ssh tucker 'tucker/deploy/update.sh'            # forward deploy (git pull)
#   ssh tucker 'cd tucker && git checkout <sha> \
#               && deploy/update.sh --no-pull'      # rollback to <sha>, stamped
#
# Hardcodes the prod overlay pair on purpose: a bare `docker compose up -d`
# in this repo would recreate the stack WITHOUT the overlay — no frontend,
# the backend's dev port re-published, and cloudflared dropped (it is
# profile-gated in the base file). See .claude/skills/deploy-prod/SKILL.md
# for the full deploy protocol around this script.
set -euo pipefail

cd "$(dirname "$0")/.."

# `--no-pull` deploys the currently checked-out commit as-is (used by rollback,
# which checks out an old SHA first); the default pulls the branch tip.
if [[ "${1:-}" != "--no-pull" ]]; then
  git pull
fi

# Build stamp (issue #117): the version the images report at /api/version and in
# the Profile footer. Computed AFTER the checkout/pull so the SHA pins the commit
# being deployed. The short SHA distinguishes builds.
#
# Semver: the root VERSION file holds the `major.minor` base (e.g. `0.1`); the
# patch is *derived* as the number of commits since VERSION last changed, so every
# deploy advances it (v0.1.0, v0.1.1, …) with no manual bump, and it resets to 0
# when you bump the minor/major by editing VERSION. Assign before exporting: under
# `set -e` a failing `$(...)` in a bare assignment aborts the deploy, but the same
# substitution inside `export` is masked by the builtin's own exit status — so a
# missing VERSION would otherwise ship a blank version instead of failing fast.
BASE_VERSION="$(cat VERSION)"
GIT_SHA="$(git rev-parse --short HEAD)"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Commit that last touched VERSION → patch = commits since (0 right after a bump).
# Fall back to the full count if VERSION has no history (shouldn't happen).
version_commit="$(git log -1 --format=%H -- VERSION)"
if [ -n "$version_commit" ]; then
  patch="$(git rev-list --count "${version_commit}..HEAD")"
else
  patch="$(git rev-list --count HEAD)"
fi
APP_VERSION="${BASE_VERSION}.${patch}"
export APP_VERSION GIT_SHA BUILT_AT

# Persist the stamp into .env as well, not just this shell's environment. Compose
# auto-reads .env for ${VAR} interpolation, so a *bare* rebuild that skips this
# script — e.g. a hand-run `docker compose ... up -d --build` — then inherits the
# real stamp instead of silently baking the dev/unknown build-arg defaults (the
# bug behind "the Profile version never updates"). Upsert each key in place so
# the secret keys already in .env (TUNNEL_TOKEN, LITESTREAM_*) are never touched.
upsert_env() {
  local key="$1" val="$2" file=".env"
  touch "$file"
  if grep -qE "^${key}=" "$file"; then
    # key/val are tame (a literal name, a semver, a short SHA, an ISO timestamp)
    # — no sed metacharacters — but use a `#` delimiter so a `/` can never break it.
    sed -i "s#^${key}=.*#${key}=${val}#" "$file"
    return
  fi
  # New key: ensure a trailing newline first, so we never glue onto the last line.
  if [ -s "$file" ] && [ -n "$(tail -c1 "$file")" ]; then
    printf '\n' >>"$file"
  fi
  printf '%s=%s\n' "$key" "$val" >>"$file"
}
upsert_env APP_VERSION "$APP_VERSION"
upsert_env GIT_SHA "$GIT_SHA"
upsert_env BUILT_AT "$BUILT_AT"

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
