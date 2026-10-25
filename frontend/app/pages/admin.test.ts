import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, serverError } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { signedInAsAdmin } from '~~/test/mocks/handlers/identity'
import {
  measured,
  metricsBy,
  metricsReport,
  noWebVitals,
  vitalIn,
} from '~~/test/mocks/handlers/metrics'
import { renderInApp } from '~~/test/render-in-app'
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
    await renderInApp(AdminPage)

    expect(screen.queryAllByRole('combobox', { hidden: true })).toHaveLength(0)
    expect(
      screen.queryByRole('group', { name: 'Filters', hidden: true }),
    ).not.toBeInTheDocument()
  })

  it('is the Metrics page under an Admin eyebrow', async () => {
    server.use(signedInAsAdmin)
    await renderInApp(AdminPage)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Metrics',
    )
    expect(screen.getByText('Admin')).toBeVisible()
  })

  it('narrows the metrics to the last 30 days, every engine, version and way of opening Tucker, until told otherwise', async () => {
    server.use(signedInAsAdmin)
    await renderInApp(AdminPage)

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
    await renderInApp(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'Range' }))

    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent?.trim()),
    ).toEqual(['Last 24 hours', 'Last 7 days', 'Last 30 days', 'Last 90 days'])
  })

  it('offers WebKit, Blink and Gecko as engines', async () => {
    const user = userEvent.setup()
    server.use(signedInAsAdmin)
    await renderInApp(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'Engine' }))

    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent?.trim()),
    ).toEqual(['All engines', 'WebKit', 'Blink', 'Gecko'])
  })

  it('offers the installed app and a browser tab as ways of opening Tucker', async () => {
    const user = userEvent.setup()
    server.use(signedInAsAdmin)
    await renderInApp(AdminPage)

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
    await renderInApp(AdminPage)
    expect(await screen.findByText("Couldn't load the metrics")).toBeVisible()

    await user.click(screen.getByRole('combobox', { name: 'App version' }))

    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent?.trim()),
    ).toEqual(['All versions'])
  })

  // The backend orders them, newest release first; the page keeps its order.
  it('offers each app version the range holds, in the order the report lists them', async () => {
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
    await renderInApp(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'App version' }))

    expect(
      (await screen.findAllByRole('option')).map((o) => o.textContent?.trim()),
    ).toEqual(['All versions', '0.1.43', '0.1.42'])
  })

  // Otherwise the select reads as unset while the read still narrows by it.
  it('keeps showing the chosen app version when a narrower range no longer holds it', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(
        () => [],
        ({ range }) => (range === '24h' ? ['0.1.43'] : ['0.1.43', '0.1.42']),
      ),
    )
    await renderInApp(AdminPage)
    await user.click(screen.getByRole('combobox', { name: 'App version' }))
    await user.click(await screen.findByRole('option', { name: '0.1.42' }))

    await user.click(screen.getByRole('combobox', { name: 'Range' }))
    await user.click(
      await screen.findByRole('option', { name: 'Last 24 hours' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Nothing matches these filters',
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('combobox', { name: 'App version' }),
    ).toHaveTextContent('0.1.42')
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
    await renderInApp(AdminPage)
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

  // Releases are its axis: a chosen version narrows the rest of the page, not it.
  it("keeps each page's p75 per release up whichever app version is chosen", async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(
        ({ version }) =>
          version === null
            ? [{ route: '/review', layouts: [measured('phone')] }]
            : [],
        ['0.1.43', '0.1.42'],
        [
          {
            route: '/review',
            releases: ['0.1.42', '0.1.43'].map((version) => ({
              version,
              layouts: [
                { layout: 'phone' as const, n: 20, p75: 450 },
                { layout: 'desktop' as const, n: 2, p75: null },
              ],
            })),
          },
        ],
      ),
    )
    await renderInApp(AdminPage)
    expect(
      await screen.findByRole('heading', { level: 2, name: 'p75 per release' }),
    ).toBeVisible()

    await user.click(screen.getByRole('combobox', { name: 'App version' }))
    await user.click(await screen.findByRole('option', { name: '0.1.42' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Nothing matches these filters',
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { level: 2, name: 'p75 per release' }),
    ).toBeVisible()
    expect(screen.getByRole('table', { name: '/review' })).toBeInTheDocument()
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
    await renderInApp(AdminPage)
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
    await renderInApp(AdminPage)
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
    await renderInApp(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'Engine' }))
    await user.click(await screen.findByRole('option', { name: 'Gecko' }))

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Nothing matches these filters',
      }),
    ).toBeVisible()
    expect(
      screen.queryByText('Nothing measured in the last 30 days'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Moving between pages' }),
    ).not.toBeInTheDocument()
  })

  it('puts every filter back to its default from the empty state, and charts again', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(
        ({ range, engine, version, installed }) =>
          range === '24h' ||
          engine === 'gecko' ||
          version === '0.1.42' ||
          installed === true
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
    await renderInApp(AdminPage)
    await user.click(screen.getByRole('combobox', { name: 'Range' }))
    await user.click(
      await screen.findByRole('option', { name: 'Last 24 hours' }),
    )
    await user.click(screen.getByRole('combobox', { name: 'Engine' }))
    await user.click(await screen.findByRole('option', { name: 'Gecko' }))
    await user.click(screen.getByRole('combobox', { name: 'App version' }))
    await user.click(await screen.findByRole('option', { name: '0.1.42' }))
    await user.click(screen.getByRole('combobox', { name: 'Opened in' }))
    await user.click(await screen.findByRole('option', { name: 'Installed' }))

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
    expect(screen.getByRole('combobox', { name: 'Engine' })).toHaveTextContent(
      'All engines',
    )
    expect(
      screen.getByRole('combobox', { name: 'App version' }),
    ).toHaveTextContent('All versions')
    expect(
      screen.getByRole('combobox', { name: 'Opened in' }),
    ).toHaveTextContent('Installed or browser')
    expect(
      screen.queryByText('Nothing matches these filters'),
    ).not.toBeInTheDocument()
  })

  // Not "nothing measured yet": older timings may sit outside the default range.
  it('says nothing has been measured in the default range, and that a wider one looks further back', async () => {
    server.use(signedInAsAdmin)
    await renderInApp(AdminPage)

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Nothing measured in the last 30 days',
      }),
    ).toBeVisible()
    expect(
      screen.getByText(
        'Page timings appear here once Tucker records them. A wider range looks further back.',
      ),
    ).toBeVisible()
  })

  it('keeps the last chart up and says the metrics are loading while new filters are read', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      http.get('/api/admin/metrics', ({ query }) =>
        query.get('engine') === 'gecko'
          ? new Promise<never>(() => {})
          : undefined,
      ),
      metricsReport([
        { route: '/review', layouts: [measured('phone'), measured('desktop')] },
      ]),
    )
    await renderInApp(AdminPage)
    const metrics = screen.getByRole('region', { name: 'Metrics' })
    expect(metrics).toHaveAttribute('aria-busy', 'false')

    await user.click(screen.getByRole('combobox', { name: 'Engine' }))
    await user.click(await screen.findByRole('option', { name: 'Gecko' }))

    await vi.waitFor(() => expect(metrics).toHaveAttribute('aria-busy', 'true'))
    expect(
      screen.getByRole('heading', { name: 'Moving between pages' }),
    ).toBeVisible()
  })

  // The new filters have no answer yet, so nothing may say they match nothing.
  it('keeps the last empty state up while new filters are read', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      http.get('/api/admin/metrics', ({ query }) =>
        query.get('engine') === 'gecko'
          ? new Promise<never>(() => {})
          : undefined,
      ),
      metricsReport([]),
    )
    await renderInApp(AdminPage)

    await user.click(screen.getByRole('combobox', { name: 'Engine' }))
    await user.click(await screen.findByRole('option', { name: 'Gecko' }))

    await vi.waitFor(() =>
      expect(screen.getByRole('region', { name: 'Metrics' })).toHaveAttribute(
        'aria-busy',
        'true',
      ),
    )
    expect(
      screen.getByRole('heading', {
        name: 'Nothing measured in the last 30 days',
      }),
    ).toBeVisible()
    expect(
      screen.queryByText('Nothing matches these filters'),
    ).not.toBeInTheDocument()
  })

  // Else the default range is said to hold nothing before it has been read.
  it('keeps saying nothing matches while the default filters are read back after a reset', async () => {
    const user = userEvent.setup()
    let unfilteredReads = 0
    server.use(
      signedInAsAdmin,
      http.get('/api/admin/metrics', ({ query }) =>
        query.get('engine') === null && ++unfilteredReads > 1
          ? new Promise<never>(() => {})
          : undefined,
      ),
      metricsReport([]),
    )
    await renderInApp(AdminPage)
    await user.click(screen.getByRole('combobox', { name: 'Engine' }))
    await user.click(await screen.findByRole('option', { name: 'Gecko' }))
    await user.click(
      await screen.findByRole('button', { name: 'Reset filters' }),
    )

    await vi.waitFor(() =>
      expect(screen.getByRole('region', { name: 'Metrics' })).toHaveAttribute(
        'aria-busy',
        'true',
      ),
    )
    expect(
      screen.getByRole('heading', { name: 'Nothing matches these filters' }),
    ).toBeVisible()
    expect(
      screen.queryByText('Nothing measured in the last 30 days'),
    ).not.toBeInTheDocument()
  })

  // Not "nothing measured yet", which a failed read would state falsely.
  it('says the metrics could not be loaded when the read fails', async () => {
    server.use(
      signedInAsAdmin,
      http.get('/api/admin/metrics', ({ response }) =>
        response.untyped(serverError()),
      ),
    )
    await renderInApp(AdminPage)

    expect(await screen.findByText("Couldn't load the metrics")).toBeVisible()
    expect(
      screen.queryByText('Nothing measured in the last 30 days'),
    ).not.toBeInTheDocument()
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
    await renderInApp(AdminPage)

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
    expect(
      screen.queryByText('Nothing measured in the last 30 days'),
    ).not.toBeInTheDocument()
  })

  // Four "too few (n 0)" say nothing a moves chart beside them does not.
  it('states no page load or interaction while neither has been measured', async () => {
    server.use(
      signedInAsAdmin,
      metricsReport(
        [{ route: '/review', layouts: [measured('phone')] }],
        [],
        [],
        noWebVitals(),
      ),
    )
    await renderInApp(AdminPage)

    expect(
      await screen.findByRole('heading', { name: 'Moving between pages' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: 'Page load (LCP)' }),
    ).not.toBeInTheDocument()
  })

  it('states page load as measured in the chosen engine', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(
        () => [],
        [],
        [],
        ({ engine }) => ({
          ...noWebVitals(),
          lcp: [
            engine === 'webkit'
              ? vitalIn('phone', 6, { p50: 2_600, p75: 3_100, p95: 4_200 })
              : vitalIn('phone', 20, { p50: 1_800, p75: 2_140, p95: 3_900 }),
            vitalIn('desktop', 0),
          ],
        }),
      ),
    )
    await renderInApp(AdminPage)
    const pageLoad = within(
      await screen.findByRole('region', { name: 'Page load (LCP)' }),
    )

    await user.click(screen.getByRole('combobox', { name: 'Engine' }))
    await user.click(await screen.findByRole('option', { name: 'WebKit' }))

    await vi.waitFor(() =>
      expect(
        pageLoad.getByRole('row', { name: 'Phone 3100 ms' }),
      ).toBeVisible(),
    )
  })

  // A single-page visit records a page load and no move between pages.
  it('says nothing is measured only while page load and interaction are not either', async () => {
    server.use(
      signedInAsAdmin,
      metricsReport([], [], [], {
        ...noWebVitals(),
        lcp: [
          vitalIn('phone', 20, { p50: 1_800, p75: 2_140, p95: 3_900 }),
          vitalIn('desktop', 0),
        ],
      }),
    )
    await renderInApp(AdminPage)

    expect(
      await screen.findByRole('region', { name: 'Page load (LCP)' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', {
        name: 'Nothing measured in the last 30 days',
      }),
    ).not.toBeInTheDocument()
  })

  it('says there were no moves between pages while page load alone was measured', async () => {
    server.use(
      signedInAsAdmin,
      metricsReport([], [], [], {
        ...noWebVitals(),
        lcp: [
          vitalIn('phone', 20, { p50: 1_800, p75: 2_140, p95: 3_900 }),
          vitalIn('desktop', 0),
        ],
      }),
    )
    await renderInApp(AdminPage)

    const moves = within(
      await screen.findByRole('region', { name: 'Moving between pages' }),
    )
    expect(
      moves.getByText('No moves between pages in the last 30 days'),
    ).toBeVisible()
  })

  it('says nothing matches the filters only while page load and interaction do not either', async () => {
    const user = userEvent.setup()
    server.use(
      signedInAsAdmin,
      metricsBy(
        ({ version }) =>
          version ? [] : [{ route: '/review', layouts: [measured('phone')] }],
        ['0.1.43'],
        [],
        () => ({
          ...noWebVitals(),
          lcp: [
            vitalIn('phone', 20, { p50: 1_800, p75: 2_140, p95: 3_900 }),
            vitalIn('desktop', 0),
          ],
        }),
      ),
    )
    await renderInApp(AdminPage)
    await screen.findByRole('heading', { name: 'Moving between pages' })

    await user.click(screen.getByRole('combobox', { name: 'App version' }))
    await user.click(await screen.findByRole('option', { name: '0.1.43' }))

    const moves = within(
      await screen.findByRole('region', { name: 'Moving between pages' }),
    )
    expect(moves.getByText('No moves match these filters')).toBeVisible()
    expect(moves.getByRole('button', { name: 'Reset filters' })).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Page load (LCP)' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Nothing matches these filters' }),
    ).not.toBeInTheDocument()
  })

  it('states interaction once it alone is measured', async () => {
    server.use(
      signedInAsAdmin,
      metricsReport([], [], [], {
        ...noWebVitals(),
        inp: [
          vitalIn('phone', 9, { p50: 120, p75: 180, p95: 260 }),
          vitalIn('desktop', 0),
        ],
      }),
    )
    await renderInApp(AdminPage)

    const interaction = within(
      await screen.findByRole('region', { name: 'Interaction (INP)' }),
    )
    expect(interaction.getByRole('row', { name: 'Phone 180 ms' })).toBeVisible()
  })

  it('states page load and interaction per layout once either is measured', async () => {
    server.use(
      signedInAsAdmin,
      metricsReport([], [], [], {
        ...noWebVitals(),
        lcp: [
          vitalIn('phone', 20, { p50: 1_800, p75: 2_140, p95: 3_900 }),
          vitalIn('desktop', 2),
        ],
      }),
    )
    await renderInApp(AdminPage)

    const pageLoad = within(
      await screen.findByRole('region', { name: 'Page load (LCP)' }),
    )
    expect(pageLoad.getByRole('row', { name: 'Phone 2140 ms' })).toBeVisible()
    expect(
      within(
        screen.getByRole('region', { name: 'Interaction (INP)' }),
      ).getByRole('row', { name: 'Phone too few (n 0)' }),
    ).toBeVisible()
  })
})
