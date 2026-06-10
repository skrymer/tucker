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
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
