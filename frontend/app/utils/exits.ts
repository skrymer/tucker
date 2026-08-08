/**
 * The SPA's exits: the paths that leave Tucker for Cloudflare Access, and the
 * prefixes the service worker must therefore never answer from cache.
 *
 * They live together because they are one rule, not two facts. The precached
 * app shell (ADR 0011) answers *any* navigation Workbox is willing to fall back
 * on, so an exit whose prefix is missing from [NETWORK_ONLY_PREFIXES] does not
 * fail — it silently re-renders Tucker, leaving the user tapping a link that
 * appears to do nothing. That only reproduces in the installed PWA, which is
 * the worst place to find it.
 *
 * `exits.test.ts` keeps the pair honest. Before it, the rule was stated in
 * three comments in three files that never referenced each other, and deleting
 * a prefix left the whole suite green.
 *
 * **Keep this file free of value imports.** `nuxt.config.ts` imports it, so it
 * is evaluated before Nuxt exists — a `zod`, `#open-fetch-schemas/api` or `~/…`
 * import (six of its sibling utils have one, so it is a natural next edit)
 * would break every `nuxt` command, not merely the app. Type-only imports are
 * erased and stay safe.
 */

/** Where **Sign out** goes: Access ends the session at its own edge (#160). */
export const SIGN_OUT_PATH = '/cdn-cgi/access/logout'

/**
 * Where **Sign back in** goes. Not a login URL, and deliberately a path the
 * *backend* leaves open (ADR 0020): what runs the challenge is Cloudflare
 * Access at the edge, which sits in front of every path regardless. Pointing
 * this at a backend-gated path would buy nothing and only risks a 401 arriving
 * where a login screen should.
 */
export const SIGN_IN_PATH = '/api/version'

/**
 * Prefixes the service worker's navigation fallback must skip.
 *
 * Namespaces, not paths: `/cdn-cgi/` is Cloudflare's whole reserved namespace
 * (`access/login`, `access/logout`, `trace`, `challenge-platform`), so the next
 * one needs no edit. Pinning one URL would have been the bandaid.
 */
export const NETWORK_ONLY_PREFIXES = [/^\/api\//, /^\/cdn-cgi\//]
