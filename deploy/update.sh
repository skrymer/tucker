#!/usr/bin/env bash
# Update Tucker's production stack. Runs ON the VPS, from any directory:
#
#   ssh tucker 'tucker/deploy/update.sh'
#
# Hardcodes the prod overlay pair on purpose: a bare `docker compose up -d`
# in this repo would recreate the stack WITHOUT the overlay — no frontend,
# the backend's dev port re-published, and cloudflared dropped (it is
# profile-gated in the base file). See .claude/skills/deploy-prod/SKILL.md
# for the full deploy protocol around this script.
set -euo pipefail

cd "$(dirname "$0")/.."
git pull

# Build stamp (issue #117): the version the images will report at /api/version
# and in the Profile footer. Exported AFTER the pull so the SHA pins the commit
# just deployed. The root VERSION file is the single semver source both images
# bake; the short SHA distinguishes builds between bumps.
# Assign before exporting: under `set -e` a failing `$(...)` in a bare
# assignment aborts the deploy, but the same substitution inside `export` is
# masked by the builtin's own exit status — so a missing VERSION would otherwise
# ship a blank version instead of failing fast.
APP_VERSION="$(cat VERSION)"
GIT_SHA="$(git rev-parse --short HEAD)"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export APP_VERSION GIT_SHA BUILT_AT

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
