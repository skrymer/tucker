#!/usr/bin/env bash
# Update Tucker's production stack. Runs ON the VPS, from any directory:
#
#   ssh tucker 'tucker/deploy/update.sh'              # deploy main's tip
#   ssh tucker 'tucker/deploy/update.sh --tag 0.1.69' # roll back to a version
#
# Nothing is built here. CI publishes both images to GHCR and this pulls the tag
# for the commit being deployed, then recreates the containers around it
# (ADR 0015). The compose file pair is hardcoded on purpose: a bare
# `docker compose up -d` in this repository would recreate the stack WITHOUT the
# overlay — the backend's port republished on the host, and the tunnel and the
# replica dropped, since both are profile-gated in the base file. See
# .claude/skills/deploy-prod/SKILL.md for the protocol around this script.
set -euo pipefail

cd "$(dirname "$0")/.."

compose() {
  docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"
}

# Writes a key into .env *in place*, leaving every other line — the tunnel token,
# the Access settings, the R2 credentials — byte for byte as it found them. That
# is the reason for editing rather than rewriting: this file is the node's whole
# secret store, and a deploy has no business rewriting it to change one label.
# Compose reads .env for ${VAR} interpolation, which is what makes the deployed
# tag survive a hand-run `docker compose ... up -d` that skips this script.
upsert_env() {
  local key="$1" value="$2" file=".env"
  touch "$file"
  if grep -qE "^${key}=" "$file"; then
    # A `#` delimiter rather than `/`, so a value containing a slash can never
    # break the expression.
    sed -i "s#^${key}=.*#${key}=${value}#" "$file"
    return
  fi
  # A new key: guarantee a trailing newline first, so it never glues onto the
  # last line of an existing file.
  if [ -s "$file" ] && [ -n "$(tail -c1 "$file")" ]; then
    printf '\n' >>"$file"
  fi
  printf '%s=%s\n' "$key" "$value" >>"$file"
}

# `--tag <version>` deploys a published version as-is and leaves the checkout
# alone, which is what a rollback now is: the images are already built, so going
# back is a retag rather than a rebuild.
if [ "${1:-}" = "--tag" ]; then
  tag="${2:?--tag needs a version, e.g. --tag 0.1.69}"
else
  git pull
  tag="$(deploy/version.sh)"
fi

upsert_env TUCKER_TAG "$tag"

echo "Deploying ${tag}."

# Both ways this can fail say almost nothing on their own — "unauthorized" names
# neither the cause nor the fix, and "not found" reads like a typo — so they are
# named here instead.
if ! compose pull; then
  echo >&2
  echo "Could not pull ${tag}." >&2
  echo "  unauthorized -> this node has never signed in to GHCR; see" >&2
  echo "                  'Sign the node in to GHCR' in deploy/README.md." >&2
  echo "  not found    -> CI has not published this commit yet, or it went red." >&2
  exit 1
fi

compose up -d
compose ps
