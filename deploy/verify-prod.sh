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
for p in / /api/foods /manifest.webmanifest /sw.js /push-sw.js; do
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$HOST$p")
  check "GET $p unauthenticated -> Access redirect" 302 "$code"
done

# 2. The three prod containers are running (inspect by name, so an extra
#    container like litestream never breaks this check).
running=$(ssh "$SSH_TARGET" \
  'docker inspect -f "{{.State.Running}}" tucker-backend tucker-frontend tucker-cloudflared 2>/dev/null | paste -sd, -')
check "backend,frontend,cloudflared running" "true,true,true" "$running"

# 3. Same-origin /api inside the frontend container (image has node, no wget).
#    Container-local traffic never passed through Access, so it carries no
#    assertion — which makes each probe two checks in one: the proxy reached the
#    backend (0 would mean it did not), and the gate answered as it should.
#    A 0 means the escaping below broke; the two are worth telling apart.
#    One helper, because the hard part is the three-layer quoting through ssh ->
#    docker exec -> node -e, and a second copy of it is a second thing to keep
#    right against a box only the deploy exercises.
in_frontend() { # path expr fallback -> what `expr` printed for the response
  ssh "$SSH_TARGET" \
    "docker exec tucker-frontend node -e \"fetch('http://localhost:3000$1').then(r => console.log($2)).catch(() => console.log('$3'))\""
}

probe() { # path -> HTTP status, or 0 if the request never completed
  in_frontend "$1" 'r.status' 0
}

#    401, not 200: a 200 here means the gate is off — an incident, like a 200 in
#    check 1. /api/version stays open either way, so an operator can tell "the app
#    is down" from "the app is rejecting me" (ADR 0020, Consequences) — which is
#    the recovery path if the Access config is ever wrong.
check "in-container same-origin /api reaches a gated backend" 401 "$(probe /api/foods)"
check "in-container /api/version reachable without an assertion" 200 "$(probe /api/version)"

# 4. The four URLs an update has to arrive through must revalidate, or the deploy
#    you just made never reaches an installed app (ADR 0011). This proves the
#    running image carries the rule and nothing more: it reads the header at the
#    origin, so it is blind to Cloudflare, which can still be answering /sw.js
#    from its own cache. That half is a logged-in check in deploy/README.md.
cache_control() { # path -> the Cache-Control header, or a word saying why not
  in_frontend "$1" "r.headers.get('cache-control') || 'absent'" unreachable
}

for p in / /sw.js /push-sw.js /manifest.webmanifest; do
  check "origin $p revalidates" no-cache "$(cache_control "$p")"
done

# 5. Backend log scan — informational: judge the hits, the script does not
#    fail on them.
echo "--- backend error/exception lines, last 10m (judge manually) ---"
ssh "$SSH_TARGET" \
  'docker logs tucker-backend --since 10m 2>&1 | grep -iE "error|exception" | tail -5' || true

exit "$fail"
