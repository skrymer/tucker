// The two events the browser's install machinery fires. Named here, in a module
// with no Nuxt auto-imports, because both fakes that stand in for them live
// outside the app — Vitest's `fakeInstallEvent` and Playwright's `offerInstall` —
// and a fake dispatching a name the capture does not listen for leaves every
// suite green while the affordance never appears. The same reason `exits.ts` and
// `pwaEntryPoints.ts` hold their strings out here.

/** The browser offering an install. Fired once per page load, never repeated. */
export const INSTALL_OFFER_EVENT = 'beforeinstallprompt'

/** The browser reporting that the install went through. */
export const INSTALLED_EVENT = 'appinstalled'
