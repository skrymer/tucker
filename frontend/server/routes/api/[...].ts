import { defineEventHandler, getRequestHeader, proxyRequest } from 'h3'
import type { H3Event } from 'h3'

// Same-origin /api proxy (ADR 0015). Forward every /api/** request to the
// backend at TUCKER_API_UPSTREAM, read at *runtime* so one built image runs in
// dev (default http://localhost:8080) and prod (http://backend:8080 over the
// compose network). Replaces the build-time Nuxt routeRules proxy, so the dev
// server, the smoke build, and the production container all share one mechanism.
// event.path carries the full `/api/...?query`, so the backend sees the same
// path it does today.
export default defineEventHandler((event) => {
  // `||` (not `??`) so an empty TUCKER_API_UPSTREAM also falls back to the dev
  // default instead of proxying to a relative `/api` (which would loop back into
  // this route). Strip any trailing slash so `upstream + event.path` can't
  // double the `/` before `/api`.
  const upstream = (
    process.env.TUCKER_API_UPSTREAM || 'http://localhost:8080'
  ).replace(/\/+$/, '')
  return proxyRequest(event, upstream + event.path, devAccessAssertion(event))
})

// Lower-case because that is how h3 keys the merged header map; the backend
// matches case-insensitively, as HTTP requires.
const ACCESS_ASSERTION = 'cf-access-jwt-assertion'

// `pnpm dev` has no Cloudflare in front of it, so nothing puts an assertion on the
// request and the backend — which verifies one on every /api call (ADR 0020) —
// would 401 the lot. Attach the pre-minted token instead, produced by
// `node frontend/scripts/mint-dev-token.mjs`. A static string, not a signing key:
// the dev environment can present an identity, not invent one.
//
// Strictly a *fallback*. h3 merges these headers with `set`, so returning one
// unconditionally would overwrite a real assertion rather than stand in for a
// missing one — and this file cannot tell which environment it is in, only what
// the request already carries. Deferring to an assertion that is already there
// makes a stray TUCKER_DEV_ACCESS_TOKEN in production inert instead of
// authoritative.
export function devAccessAssertion(event: H3Event) {
  const token = process.env.TUCKER_DEV_ACCESS_TOKEN
  if (!token || getRequestHeader(event, ACCESS_ASSERTION)) return undefined
  return { headers: { [ACCESS_ASSERTION]: token } }
}
