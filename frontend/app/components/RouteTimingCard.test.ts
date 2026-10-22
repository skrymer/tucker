import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import RouteTimingCard from './RouteTimingCard.vue'

// unovis' tooltip, stubbed: happy-dom's `MutationObserver.disconnect` throws on
// the observer it tears down on unmount. The browser layers render it for real.
vi.mock('@unovis/vue', async (actual) => ({
  ...(await actual<typeof import('@unovis/vue')>()),
  VisTooltip: { render: () => null },
}))

describe('RouteTimingCard', () => {
  // A service worker hands every api call on, and starting one again on a phone
  // that put it to sleep lands in the same wait as the trip itself.
  it('explains the three parts in plain words, the browser sending the requests out counted in network and proxy', async () => {
    await renderSuspended(RouteTimingCard, { props: { routes: [] } })

    expect(
      screen.getByText(
        "Server is Tucker working on the page's requests. Network + proxy is the rest of " +
          'the wait for them: the browser and its service worker sending them out, and ' +
          'their trip through Cloudflare, the tunnel and the proxy. ' +
          "Render / JS is everything else: the phone or computer running the page's code " +
          'and drawing it.',
      ),
    ).toBeVisible()
  })
})
