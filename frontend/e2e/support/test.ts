import type { AnyHandler } from 'msw'
import { defineNetworkFixture, type NetworkFixture } from '@msw/playwright'
import { test as base, expect } from '@nuxt/test-utils/playwright'
import { handlers as baseline } from '../../test/mocks/handlers'
import { fellThrough } from '../../test/mocks/http'
import { assertNoPageErrors, MOCKED_E2E_NOISE } from './console-guard'
import {
  serveWithExpiredAccessSession,
  type ExpiredAccessOrigin,
} from './expired-access-origin'

/**
 * Shared `test` for the mocked Playwright e2e suite. Two auto fixtures ride on
 * the Nuxt base:
 *
 * - `network` answers `/api` from the shared MSW handlers (ADR 0034), the same
 *   baseline the Vitest suite uses. A spec overrides it with `network.use(...)`,
 *   and a request to `/api` that no handler covers fails the test. Anything else
 *   — the app's own pages, chunks and service worker — goes to the server.
 * - `noPageErrors` fails a test on any unexpected console error, uncaught
 *   exception, or failed request. Known-benign noise is allowlisted in
 *   `console-guard.ts`.
 *
 * Interception rides Playwright's own routing, not an MSW worker script, so the
 * app's Workbox service worker stays the only one on its scope. A `page.route`
 * registered by the spec still takes precedence over it, which is how a non-API
 * route (a CDN abort, a fake camera) is answered.
 */
export const test = base.extend<{
  handlers: AnyHandler[]
  mocksApi: boolean
  network: NetworkFixture
  // `void` is Playwright's declared type for a fixture that yields no value —
  // the framework's own idiom, not a misused void.
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  noPageErrors: void
  expiredAccessOrigin: ExpiredAccessOrigin
}>({
  handlers: [baseline, { option: true }],

  /** Off only for a spec whose `/api` is served by a real origin of its own. */
  mocksApi: [true, { option: true }],

  network: [
    async ({ context, handlers, mocksApi }, use) => {
      const unhandled: string[] = []
      const network = defineNetworkFixture({
        context,
        // An uncovered `/api` request ends at `fellThrough`, failing it so it
        // never reaches the server's /api proxy; anything else goes on to the
        // server.
        handlers: [...handlers, fellThrough(unhandled)],
        onUnhandledFrame: () => {},
      })

      if (!mocksApi) return use(network)

      await network.enable()
      await use(network)
      await network.disable()

      expect(unhandled, 'requests no MSW handler covers').toEqual([])
    },
    { auto: true },
  ],

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
