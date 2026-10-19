import type { BrowserContext, Fixtures } from '@playwright/test'
import { getResponse, type AnyHandler } from 'msw'
import { defineNetworkFixture, type NetworkFixture } from '@msw/playwright'
import { expect } from '@nuxt/test-utils/playwright'
import { handlers as baseline } from '../../test/mocks/handlers'
import { fellThrough, iconLookup } from '../../test/mocks/http'

export interface NetworkFixtures {
  handlers: AnyHandler[]
  network: NetworkFixture
}

/**
 * Answers `/api` from the shared MSW handlers (ADR 0034), the same baseline the
 * Vitest suite uses. A spec overrides it with `network.use(...)`, and a request
 * to `/api` that no handler covers fails the test. An icon lookup on the Iconify
 * CDN misses, as in Vitest. Anything else — the app's own pages, chunks and
 * service worker — goes to the server.
 *
 * Interception rides Playwright's own routing, not an MSW worker script, so the
 * app's Workbox service worker stays the only one on its scope. A `page.route`
 * registered by the spec still takes precedence over it, which is how a non-API
 * route (a CDN abort, a fake camera) is answered.
 */
export const networkFixtures: Fixtures<
  NetworkFixtures,
  object,
  { context: BrowserContext }
> = {
  handlers: [baseline, { option: true }],

  network: [
    async ({ context, handlers }, use) => {
      const unhandled: string[] = []
      const network = defineNetworkFixture({
        context,
        // An uncovered `/api` request ends at `fellThrough`, failing it so it
        // never reaches the server's /api proxy; anything else goes on to the
        // server.
        handlers: [...handlers, fellThrough(unhandled)],
        onUnhandledFrame: () => {},
      })

      await answerIconLookups(context)
      await network.enable()
      await use(network)
      await network.disable()

      expect(unhandled, 'requests no MSW handler covers').toEqual([])
    },
    { auto: true },
  ],
}

/**
 * Answer the Iconify CDN from `iconLookup`, as the Vitest server does, so no test
 * reaches it. It needs a route of its own: the network fixture passes any `.json`
 * request through as a static asset before a handler sees it.
 */
async function answerIconLookups(context: BrowserContext) {
  await context.route('https://api.iconify.design/**', async (route) => {
    const request = new Request(route.request().url())
    const response = await getResponse([iconLookup], request)
    await route.fulfill({ status: response?.status ?? 404 })
  })
}
