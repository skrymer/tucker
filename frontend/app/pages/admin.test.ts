import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import { http, serverError } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { signedInAsAdmin } from '~~/test/mocks/handlers/identity'
import { metricsReport } from '~~/test/mocks/handlers/metrics'
import type { components } from '#open-fetch-schemas/api'
import AdminPage from './admin.vue'

type LayoutFigures = components['schemas']['LayoutFiguresResponse']

// unovis' tooltip, stubbed: happy-dom's `MutationObserver.disconnect` throws on
// the observer it tears down on unmount. The browser layers render it for real.
vi.mock('@unovis/vue', async (actual) => ({
  ...(await actual<typeof import('@unovis/vue')>()),
  VisTooltip: { render: () => null },
}))

/** A layout's percentiles, with an api wait, cold figure and split that the test does not read. */
function measured(
  percentiles: Pick<LayoutFigures, 'layout' | 'n' | 'p50' | 'p75' | 'p95'>,
): LayoutFigures {
  return {
    ...percentiles,
    apiP75: 300,
    coldP75: null,
    serverMs: 100,
    networkMs: 200,
    renderMs: 400,
  }
}

// The phone notice and the wide column are layout, which happy-dom cannot
// compute; e2e/admin.spec.ts measures them, and the not-found page a non-Admin
// meets.

describe('/admin', () => {
  it('is the Metrics page under an Admin eyebrow', async () => {
    server.use(signedInAsAdmin)
    await renderSuspended(AdminPage)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Metrics',
    )
    expect(screen.getByText('Admin')).toBeVisible()
  })

  it('says nothing has been measured yet', async () => {
    server.use(signedInAsAdmin)
    await renderSuspended(AdminPage)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Nothing measured yet' }),
    ).toBeVisible()
    expect(
      screen.getByText(
        'Page timings appear here once Tucker starts recording them.',
      ),
    ).toBeVisible()
  })

  // Not "nothing measured yet", which a failed read would state falsely.
  it('says the metrics could not be loaded when the read fails', async () => {
    server.use(
      signedInAsAdmin,
      http.get('/api/admin/metrics', ({ response }) =>
        response.untyped(serverError()),
      ),
    )
    await renderSuspended(AdminPage)

    expect(await screen.findByText("Couldn't load the metrics")).toBeVisible()
    expect(screen.queryByText('Nothing measured yet')).not.toBeInTheDocument()
  })

  // The bars themselves are drawn by unovis, which happy-dom cannot lay out;
  // e2e/admin.spec.ts reads them, their labels and their tooltips.
  it('charts where moving to each page spends its time, and says what each part is', async () => {
    server.use(
      signedInAsAdmin,
      metricsReport([
        {
          route: '/review',
          layouts: [
            measured({ layout: 'phone', n: 48, p50: 640, p75: 910, p95: 1820 }),
            measured({
              layout: 'desktop',
              n: 63,
              p50: 180,
              p75: 260,
              p95: 540,
            }),
          ],
        },
      ]),
    )
    await renderSuspended(AdminPage)

    // Lazy, so it lands after the page has rendered.
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Moving between pages',
      }),
    ).toBeVisible()
    expect(
      screen.getByText(
        'Where a move near the p75 spends its time, slowest page first',
      ),
    ).toBeVisible()
    const legend = screen.getByRole('list', { name: 'Parts' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((i) => i.textContent?.trim()),
    ).toEqual(['Server', 'Network + proxy', 'Render / JS'])
    expect(screen.queryByText('Nothing measured yet')).not.toBeInTheDocument()
    // The caption, asserted here rather than in a test of its own: a second
    // render of the chart in one file trips happy-dom's timers on teardown.
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
