import { test as base, expect } from '@nuxt/test-utils/playwright'
import { assertNoPageErrors, MOCKED_E2E_NOISE } from './console-guard'
import {
  serveWithExpiredAccessSession,
  type ExpiredAccessOrigin,
} from './expired-access-origin'

/**
 * Shared `test` for the mocked (`/api/*` stubbed) Playwright e2e suite. Extends
 * the Nuxt base with an auto guard that fails a test on any unexpected console
 * error, uncaught exception, or failed request — the silent regression class the
 * mocked suite never asserted on before (#85). Known-benign noise is allowlisted
 * in `console-guard.ts`.
 */
export const test = base.extend<{
  // `void` is Playwright's declared type for a fixture that yields no value —
  // the framework's own idiom, not a misused void.
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  noPageErrors: void
  expiredAccessOrigin: ExpiredAccessOrigin
}>({
  noPageErrors: [
    ({ page }, use) => assertNoPageErrors(page, use, MOCKED_E2E_NOISE),
    { auto: true },
  ],

  /**
   * The app under test, served from an origin whose Access session has expired.
   *
   * A fixture rather than a `try`/`finally` in the test body so disposal is
   * Playwright's job — a timed-out body never reaches a `finally`.
   */
  expiredAccessOrigin: async ({ page, baseURL }, use, testInfo) => {
    if (!baseURL) throw new Error('no baseURL: the Nuxt test server is not up')
    const origin = await serveWithExpiredAccessSession(baseURL)
    try {
      await use(origin)
      // The page closes first, but only on the way to passing: the service
      // worker is still precaching the shell when the assertions finish, and a
      // fetch landing after the server stops listening is a failed request the
      // error guard would fail on. This fixture also tears down before
      // Playwright's own artifact fixture, which screenshots the pages still
      // open — so on a failure the screenshot is worth more than the noise.
      if (testInfo.status === 'passed') await page.close()
    } finally {
      await origin.close()
    }
  },
})

export { expect }
