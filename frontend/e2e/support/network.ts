import type { AnyHandler } from 'msw'
import { defineNetworkFixture, type NetworkFixture } from '@msw/playwright'
import { handlers as baseline } from '../../test/mocks/handlers'
import { fellThrough } from '../../test/mocks/http'
import { expect, test as base } from './test'

/**
 * The mocked-e2e `test` whose `/api` is answered by the shared MSW handlers
 * (ADR 0034), the same baseline the Vitest suite uses. A spec overrides it with
 * `network.use(...)`, and a request to `/api` that no handler covers fails the
 * test. Anything else — the app's own pages, chunks and service worker — goes to
 * the server as before.
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
      const note = (request: Request) => {
        const url = new URL(request.url)
        unhandled.push(`${request.method} ${url.pathname}${url.search}`)
      }
      const network = defineNetworkFixture({
        context,
        handlers: [...handlers, fellThrough(note)],
        onUnhandledFrame: ({ frame }) => {
          if (frame.protocol !== 'http') return
          const { request } = frame.data as { request: Request }
          const url = new URL(request.url)
          if (!url.pathname.startsWith('/api/')) return
          note(request)
          // Fails the request too, so it never reaches the server's /api proxy.
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
