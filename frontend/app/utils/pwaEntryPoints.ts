/**
 * The four URLs a browser fetches to *replace* what an installed Tucker is
 * running: the shell, the service worker, the script the worker imports, and
 * the manifest. They are served `Cache-Control: no-cache` so a deploy can
 * reach a home screen at all — see ADR 0011, "How the shell is replaced".
 *
 * The rule is "on the update path", not "unhashed". `favicon.ico`, `robots.txt`
 * and the icons are unhashed too and deliberately absent: Workbox precaches
 * them with a revision and refetches them at a cache-busting URL, so a stale
 * one is cosmetic rather than a build that never arrives.
 *
 * **Keep this file free of value imports** — `nuxt.config.ts` builds its
 * `routeRules` from this list, so it is evaluated before Nuxt exists, and the
 * Playwright suite loads it outside the Nuxt runtime. The same constraint
 * `exits.ts` and `csrf.ts` carry, for the same reason.
 */
export const PWA_ENTRY_POINTS = [
  '/',
  '/sw.js',
  '/push-sw.js',
  '/manifest.webmanifest',
]
