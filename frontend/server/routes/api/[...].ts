import { defineEventHandler, proxyRequest } from 'h3'

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
  return proxyRequest(event, upstream + event.path)
})
