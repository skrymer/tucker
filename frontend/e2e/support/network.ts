import type { AnyHandler } from 'msw'
import { defineNetworkFixture, type NetworkFixture } from '@msw/playwright'
import { handlers as baseline } from '../../test/mocks/handlers'
import { expect, test as base } from './test'

/**
 * The mocked-e2e `test` for a spec that has moved to the shared MSW handlers
 * (ADR 0034). `/api` is answered from the same baseline the Vitest suite uses,
 * a spec overrides it with `network.use(...)`, and a request to `/api` that no
 * handler covers fails the test. Anything else — the app's own pages, chunks and
 * service worker — goes to the server as before.
 *
 * Interception rides Playwright's own routing, not an MSW worker script, so the
 * app's Workbox service worker stays the only one on its scope. A `page.route`
 * registered by the spec still takes precedence over it.
 */
export const test = base.extend<{
  handlers: AnyHandler[]
  network: NetworkFixture
}>({
  handlers: [baseline, { option: true }],

  network: [
    async ({ context, handlers }, use) => {
      const unhandled: string[] = []
      const network = defineNetworkFixture({
        context,
        handlers,
        onUnhandledFrame: ({ frame }) => {
          if (frame.protocol !== 'http') return
          const { request } = frame.data as { request: Request }
          const url = new URL(request.url)
          if (!url.pathname.startsWith('/api/')) return
          unhandled.push(`${request.method} ${url.pathname}${url.search}`)
          throw new Error(`no handler for ${request.method} ${url.pathname}`)
        },
      })

      await network.enable()
      await use(network)
      await network.disable()

      expect(unhandled, 'requests no MSW handler covers').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
