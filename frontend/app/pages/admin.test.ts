import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, serverError } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { signedInAsAdmin } from '~~/test/mocks/handlers/identity'
import {
  measured,
  metricsBy,
  metricsReport,
} from '~~/test/mocks/handlers/metrics'
import AdminPage from './admin.vue'

// unovis' chart, stubbed: its tooltip's `MutationObserver.disconnect` throws on
// unmount under happy-dom, and the chart itself raises an `_idleNext` teardown
// error once the page around it renders enough besides. Nothing here reads
// inside it; the browser layers render it for real.
vi.mock('@unovis/vue', async (actual) => ({
  ...(await actual<typeof import('@unovis/vue')>()),
  VisTooltip: { render: () => null },
  VisXYContainer: { render: () => null },
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

  it('narrows the metrics to the last 30 days, every engine, version and way of opening Tucker, until told otherwise', async () => {
    server.use(signedInAsAdmin)
    await renderSuspended(AdminPage)

    const filters = screen.getByRole('group', { name: 'Filters' })
    expect(within(filters).getAllByRole('combobox')).toHaveLength(4)
    expect(
      within(filters).getByRole('combobox', { name: 'Range' }),
    ).toHaveTextContent('Last 30 days')
    expect(
      within(filters).getByRole('combobox', { name: 'Engine' }),
    ).toHaveTextContent('All engines')
    expect(
      within(filters).getByRole('combobox', { name: 'App version' }),
    ).toHaveTextContent('All versions')
    expect(
      within(filters).getByRole('combobox', { name: 'Opened in' }),
    ).toHaveTextContent('Installed or browser')
  })

  it('offers each app version the range holds, the latest recorded first', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsReport(
        [
          {
            route: '/review',
            layouts: [measured('phone'), measured('desktop')],
          },
        ],
        ['0.1.43', '0.1.42'],
      ),
    )
    await renderSuspended(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'App version' }))

    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent?.trim()),
    ).toEqual(['All versions', '0.1.43', '0.1.42'])
  })

  // Not "nothing measured yet": something was, only none of it in these filters.
  it('says nothing matches when the chosen filters leave nothing to chart', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(({ engine }) =>
        engine === 'gecko'
          ? []
          : [
              {
                route: '/review',
                layouts: [measured('phone'), measured('desktop')],
              },
            ],
      ),
    )
    await renderSuspended(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'Engine' }))
    await user.click(await screen.findByRole('option', { name: 'Gecko' }))

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Nothing matches these filters',
      }),
    ).toBeVisible()
    expect(screen.queryByText('Nothing measured yet')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Moving between pages' }),
    ).not.toBeInTheDocument()
  })

  it('puts every filter back to its default from the empty state, and charts again', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(
        ({ range, version }) =>
          range === '24h' || version === '0.1.42'
            ? []
            : [
                {
                  route: '/review',
                  layouts: [measured('phone'), measured('desktop')],
                },
              ],
        ['0.1.43', '0.1.42'],
      ),
    )
    await renderSuspended(AdminPage)
    await user.click(screen.getByRole('combobox', { name: 'Range' }))
    await user.click(
      await screen.findByRole('option', { name: 'Last 24 hours' }),
    )
    await user.click(screen.getByRole('combobox', { name: 'App version' }))
    await user.click(await screen.findByRole('option', { name: '0.1.42' }))

    await user.click(
      await screen.findByRole('button', { name: 'Reset filters' }),
    )

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Moving between pages',
      }),
    ).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Range' })).toHaveTextContent(
      'Last 30 days',
    )
    expect(
      screen.getByRole('combobox', { name: 'App version' }),
    ).toHaveTextContent('All versions')
    expect(
      screen.queryByText('Nothing matches these filters'),
    ).not.toBeInTheDocument()
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
  it('charts where moving to each page spends its time, legend first, once something is measured', async () => {
    server.use(
      signedInAsAdmin,
      metricsReport([
        {
          route: '/review',
          layouts: [
            measured('phone', { n: 48 }),
            measured('desktop', { n: 63 }),
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
  })
})
