// Keep this file free of value imports: the Playwright smokes load it outside the Nuxt
// runtime, so anything it pulls in has to resolve there too.

/**
 * The name Spring's `CookieCsrfTokenRepository` hands the token out under, and the header
 * it reads it back from (ADR 0025).
 */
export const CSRF_COOKIE = 'XSRF-TOKEN'
export const CSRF_HEADER = 'X-XSRF-TOKEN'

/** Spring's own set — anything else is state-changing and must carry the token. */
export const SAFE_METHODS = ['GET', 'HEAD', 'TRACE', 'OPTIONS']

/**
 * The CSRF token Tucker last handed this browser, or null before it has handed one out.
 *
 * Reading it here — in the page — is the whole of the defence: a cross-site page can cause
 * a request to Tucker carrying the ambient Access cookie, but cannot read Tucker's cookies
 * to echo this back. Never move this into the `/api` proxy, which sees the cookie on the
 * attacker's request too and would complete the attack for them.
 */
export function readCsrfToken(cookie: string): string | null {
  const match = cookie
    .split(';')
    .find((c) => c.trim().startsWith(`${CSRF_COOKIE}=`))
  return match ? match.trim().slice(CSRF_COOKIE.length + 1) : null
}
