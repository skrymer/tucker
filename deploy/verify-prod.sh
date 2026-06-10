#!/usr/bin/env bash
# Verify Tucker's production deployment. Runs on the operator's WORKSTATION:
#
#   deploy/verify-prod.sh
#
# Curl-based on purpose — a browser's stale service worker can serve the
# precached shell and mask both outages and the Access gate. Exits non-zero
# if any check fails. Requires curl and the `tucker` SSH alias (override
# host/alias with TUCKER_HOST / TUCKER_SSH).
set -uo pipefail # no -e: collect every failure, then exit non-zero

HOST="${TUCKER_HOST:-tucker-diet.com}"
SSH_TARGET="${TUCKER_SSH:-tucker}"
fail=0

check() { # label expected actual
  if [ "$2" = "$3" ]; then
    echo "ok   $1 ($3)"
  else
    echo "FAIL $1 — expected $2, got $3"
    fail=1
  fi
}

# 1. Unauthenticated probes must 302 to Cloudflare Access on every path.
#    A 200 means the app is publicly exposed — treat as an incident.
for p in / /api/foods /manifest.webmanifest /sw.js; do
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$HOST$p")
  check "GET $p unauthenticated -> Access redirect" 302 "$code"
done

# 2. The three prod containers are running (inspect by name, so an extra
#    container like litestream never breaks this check).
running=$(ssh "$SSH_TARGET" \
  'docker inspect -f "{{.State.Running}}" tucker-backend tucker-frontend tucker-cloudflared 2>/dev/null | paste -sd, -')
check "backend,frontend,cloudflared running" "true,true,true" "$running"

# 3. Same-origin /api inside the frontend container (image has node, no wget).
api=$(ssh "$SSH_TARGET" \
  'docker exec tucker-frontend node -e "fetch(\"http://localhost:3000/api/foods\").then(r => console.log(r.status)).catch(() => console.log(0))"')
check "in-container same-origin /api" 200 "$api"

# 4. Backend log scan — informational: judge the hits, the script does not
#    fail on them.
echo "--- backend error/exception lines, last 10m (judge manually) ---"
ssh "$SSH_TARGET" \
  'docker logs tucker-backend --since 10m 2>&1 | grep -iE "error|exception" | tail -5' || true

exit "$fail"
