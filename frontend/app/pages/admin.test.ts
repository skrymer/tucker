import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import { server } from '~~/test/mocks/node'
import { signedInAsAdmin } from '~~/test/mocks/handlers/identity'
import { metricsReport } from '~~/test/mocks/handlers/metrics'
import AdminPage from './admin.vue'

// unovis' tooltip, stubbed: happy-dom's `MutationObserver.disconnect` throws on
// the observer it tears down on unmount. The browser layers render it for real.
vi.mock('@unovis/vue', async (actual) => ({
  ...(await actual<typeof import('@unovis/vue')>()),
  VisTooltip: { render: () => null },
}))

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

  // The bars themselves are drawn by unovis, which happy-dom cannot lay out;
  // e2e/admin.spec.ts reads them, their labels and their tooltips.
  it('charts how long moving to each page takes, phone beside desktop, once something is measured', async () => {
    server.use(
      signedInAsAdmin,
      metricsReport([
        {
          route: '/review',
          layouts: [
            { layout: 'phone', n: 48, p50: 640, p75: 910, p95: 1820 },
            { layout: 'desktop', n: 63, p50: 180, p75: 260, p95: 540 },
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
    expect(screen.getByText('p75 per page, slowest first')).toBeVisible()
    const legend = screen.getByRole('list', { name: 'Layouts' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((i) => i.textContent?.trim()),
    ).toEqual(['Phone', 'Desktop'])
    expect(screen.queryByText('Nothing measured yet')).not.toBeInTheDocument()
  })
})
