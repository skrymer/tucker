import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
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

// Desktop by default, as jsdom resolves it; a phone opts in.
const viewport = vi.hoisted(() => ({ desktop: true }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

// The phone notice and the wide column are layout, which happy-dom cannot
// compute; e2e/admin.spec.ts measures them, and the not-found page a non-Admin
// meets.

describe('/admin', () => {
  beforeEach(() => {
    viewport.desktop = true
  })

  // Hidden there by CSS either way; built, it would be four selects for nothing.
  it('builds no filters on a phone', async () => {
    viewport.desktop = false
    server.use(signedInAsAdmin)
    await renderSuspended(AdminPage)

    expect(screen.queryAllByRole('combobox', { hidden: true })).toHaveLength(0)
    expect(
      screen.queryByRole('group', { name: 'Filters', hidden: true }),
    ).not.toBeInTheDocument()
  })

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

  it('offers the last day, week, month and quarter as ranges', async () => {
    const user = userEvent.setup()
    server.use(signedInAsAdmin)
    await renderSuspended(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'Range' }))

    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent?.trim()),
    ).toEqual(['Last 24 hours', 'Last 7 days', 'Last 30 days', 'Last 90 days'])
  })

  it('offers WebKit, Blink and Gecko as engines', async () => {
    const user = userEvent.setup()
    server.use(signedInAsAdmin)
    await renderSuspended(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'Engine' }))

    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent?.trim()),
    ).toEqual(['All engines', 'WebKit', 'Blink', 'Gecko'])
  })

  it('offers the installed app and a browser tab as ways of opening Tucker', async () => {
    const user = userEvent.setup()
    server.use(signedInAsAdmin)
    await renderSuspended(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'Opened in' }))

    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent?.trim()),
    ).toEqual(['Installed or browser', 'Installed', 'Browser'])
  })

  // The row stays above a failed read, so its versions are those of no report at all.
  it('offers no app version but all of them when the metrics could not be loaded', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      http.get('/api/admin/metrics', ({ response }) =>
        response.untyped(serverError()),
      ),
    )
    await renderSuspended(AdminPage)
    expect(await screen.findByText("Couldn't load the metrics")).toBeVisible()

    await user.click(screen.getByRole('combobox', { name: 'App version' }))

    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent?.trim()),
    ).toEqual(['All versions'])
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

  // Measured only while no version is sent: a chosen one must reach the read.
  it('narrows the chart to the chosen app version', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(
        ({ version }) =>
          version === null
            ? [{ route: '/review', layouts: [measured('phone')] }]
            : [],
        ['0.1.43', '0.1.42'],
      ),
    )
    await renderSuspended(AdminPage)
    expect(
      await screen.findByRole('heading', { name: 'Moving between pages' }),
    ).toBeVisible()

    await user.click(screen.getByRole('combobox', { name: 'App version' }))
    await user.click(await screen.findByRole('option', { name: '0.1.42' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Nothing matches these filters',
      }),
    ).toBeVisible()
  })

  // Measured everywhere but the installed app, so Installed must reach the read as such.
  it('narrows the chart to moves made in the installed app', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(({ installed }) =>
        installed === true
          ? []
          : [{ route: '/review', layouts: [measured('phone')] }],
      ),
    )
    await renderSuspended(AdminPage)
    expect(
      await screen.findByRole('heading', { name: 'Moving between pages' }),
    ).toBeVisible()

    await user.click(screen.getByRole('combobox', { name: 'Opened in' }))
    await user.click(await screen.findByRole('option', { name: 'Installed' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Nothing matches these filters',
      }),
    ).toBeVisible()
  })

  // Measured only where no flag is sent, so Browser must reach the read as not installed.
  it('narrows the chart to moves made in a browser tab', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(({ installed }) =>
        installed === null
          ? [{ route: '/review', layouts: [measured('phone')] }]
          : installed
            ? [{ route: '/foods', layouts: [measured('phone')] }]
            : [],
      ),
    )
    await renderSuspended(AdminPage)
    expect(
      await screen.findByRole('heading', { name: 'Moving between pages' }),
    ).toBeVisible()

    await user.click(screen.getByRole('combobox', { name: 'Opened in' }))
    await user.click(await screen.findByRole('option', { name: 'Browser' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Nothing matches these filters',
      }),
    ).toBeVisible()
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
