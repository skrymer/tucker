// Cloudflare Access gates the whole origin (ADR 0015), so an expired session
// intercepts every `/api/*` call with its own login redirect before the
// request ever reaches this app. Left on the default 'follow', the browser
// would silently try — and CORS-fail — to follow that cross-origin redirect,
// which every call site today catches identically to a legitimate empty
// state. `redirect: 'manual'` stops the browser there, producing an
// inspectable opaque response (status 0, type 'opaqueredirect') this plugin
// recognises instead of following it — the auth-gate then short-circuits the
// whole app to the "log back in" state (see app/layouts/default.vue).
//
// Unverified against a real redirect: Playwright's `route.fulfill` with a 3xx
// status doesn't reproduce this — it surfaces to the page as a genuine
// `net::ERR_ABORTED` request failure, not the resolved opaque Response a real
// server's redirect produces under `redirect: 'manual'` (a CDP interception
// limitation, not app behaviour), so the mocked/smoke suites can't exercise
// this path end-to-end. `isAuthRedirectResponse` and the hook wiring are unit
// (useAuthGate.test.ts) and cross-file-traced, but the actual trigger needs a
// real Cloudflare Access session expiry to confirm — do this once, manually,
// against the deployed app, and don't re-attempt the route.fulfill approach.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hook('openFetch:onRequest:api', ({ options }) => {
    options.redirect = 'manual'
  })

  // `onResponse` (not `onResponseError`): ofetch only treats status 400-599
  // as an error, and an opaque redirect's status is 0.
  nuxtApp.hooks.hook('openFetch:onResponse:api', ({ response }) => {
    if (isAuthRedirectResponse(response)) {
      useAuthGate().markLoggedOut()
    }
  })
})
