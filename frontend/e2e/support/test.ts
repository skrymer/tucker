import { test as base, expect } from '@nuxt/test-utils/playwright'
import { assertNoPageErrors, MOCKED_E2E_NOISE } from './console-guard'
import {
  serveWithExpiredAccessSession,
  type ExpiredAccessOrigin,
} from './expired-access-origin'
import { networkFixtures, type NetworkFixtures } from './network'

/**
 * Shared `test` for the mocked Playwright e2e suite. Two auto fixtures ride on
 * the Nuxt base: `network` answers `/api` from the shared MSW handlers
 * (`network.ts`), and `noPageErrors` fails a test on any unexpected console
 * error, uncaught exception, or failed request — known-benign noise is
 * allowlisted in `console-guard.ts`.
 */
export const test = base.extend<
  NetworkFixtures & {
    // `void` is Playwright's declared type for a fixture that yields no value —
    // the framework's own idiom, not a misused void.
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    noPageErrors: void
    expiredAccessOrigin: ExpiredAccessOrigin
  }
>({
  ...networkFixtures,

  noPageErrors: [
    ({ page }, use) => assertNoPageErrors(page, use, MOCKED_E2E_NOISE),
    { auto: true },
  ],

  /**
   * The app under test, served from an origin whose Access session has expired.
   * Its own redirects answer `/api`, so the MSW handlers are off while it lives.
   *
   * A fixture rather than a `try`/`finally` in the test body so disposal is
   * Playwright's job — a timed-out body never reaches a `finally`.
   */
  expiredAccessOrigin: async ({ page, baseURL, network }, use, testInfo) => {
    if (!baseURL) throw new Error('no baseURL: the Nuxt test server is not up')
    await network.disable()
    try {
      const origin = await serveWithExpiredAccessSession(baseURL)
      try {
        await use(origin)
        // The page closes first, but only on the way to passing: the service
        // worker is still precaching the shell when the assertions finish, and
        // a fetch landing after the server stops listening is a failed request
        // the error guard would fail on. This fixture also tears down before
        // Playwright's own artifact fixture, which screenshots the pages still
        // open — so on a failure the screenshot is worth more than the noise.
        if (testInfo.status === 'passed') await page.close()
      } finally {
        await origin.close()
      }
    } finally {
      await network.enable()
    }
  },
})

export { expect }
