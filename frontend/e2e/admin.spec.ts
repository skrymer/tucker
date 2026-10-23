import type { Locator, Page } from '@playwright/test'
import { expect, test } from './support/test'
import { signedInAsAdmin } from '../test/mocks/handlers/identity'
import {
  metricsBy,
  metricsRecorded,
  metricsReport,
  tooFew,
} from '../test/mocks/handlers/metrics'
import { hidePage } from './support/visibility'
import { held } from '../test/mocks/http'

/**
 * One layout's figures, enough samples for a figure, with [p75] the number that
 * orders it, split a fifth server, a fifth network and the rest render.
 */
const figures = (layout: 'phone' | 'desktop', p75: number) => ({
  layout,
  n: 20,
  p50: p75 - 100,
  p75,
  p95: p75 + 400,
  apiP75: (p75 * 2) / 5,
  coldP75: p75 + 600,
  serverMs: p75 / 5,
  networkMs: p75 / 5,
  renderMs: (p75 * 3) / 5,
})

// The Metrics page's layout (ADR 0039): a column wider than the shared one on a
// desktop, a one-line notice on a phone, and the ordinary not-found page for a
// User who is not an Admin.

/**
 * The [part]-th part from the axis (0 server, 2 render) of the top or bottom bar.
 * unovis draws the bars as bare paths, with no role or name to find them by, so
 * they are told apart by where they sit, read in one pass for the axis' sake.
 */
async function barPart(page: Page, row: 'top' | 'bottom', part: number) {
  const selector = '.route-timing path[class*="-bar"]'
  const index = await page.evaluate(
    ([selector, row, part]) => {
      const paths = [...document.querySelectorAll(selector as string)].map(
        (p, i) => ({ i, box: p.getBoundingClientRect() }),
      )
      const ys = paths.map(({ box }) => Math.round(box.y))
      const y = row === 'top' ? Math.min(...ys) : Math.max(...ys)
      return paths
        .filter(({ box }) => Math.round(box.y) === y)
        .sort((a, b) => a.box.x - b.box.x)[part as number]!.i
    },
    [selector, row, part] as const,
  )
  return page.locator(selector).nth(index)
}

/**
 * The [n]th point drawn on the per-release charts, left to right. A release with
 * no figure in a layout still gets an element, with nothing drawn: skipped.
 */
async function releasePoint(page: Page, n: number) {
  const selector = '.release-trend [class$="-point"]'
  await expect(page.locator(selector).first()).toBeAttached()
  const index = await page.evaluate(
    ([selector, n]) =>
      [...document.querySelectorAll(selector as string)]
        .map((p, i) => ({ i, box: p.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0)
        .sort((a, b) => a.box.x - b.box.x)[n as number]!.i,
    [selector, n] as const,
  )
  return page.locator(selector).nth(index)
}

/** The points drawn on the per-release charts. */
const POINTS = '.release-trend [class$="-point"]'

/** A route's releases, each `[version, phone p75, desktop p75]`, 20 moves apiece. */
const releasesOf = (route: string, releases: [string, number, number][]) => ({
  route,
  releases: releases.map(([version, phone, desktop]) => ({
    version,
    layouts: [
      { layout: 'phone' as const, n: 20, p75: phone },
      { layout: 'desktop' as const, n: 20, p75: desktop },
    ],
  })),
})

/** The fill of each part of the one bar drawn, from the axis out. */
const partColours = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.route-timing path[class*="-bar"]')]
      .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
      .map((b) => getComputedStyle(b).fill),
  )

/** How opaque [locator] is drawn: its own opacity times every ancestor's. */
const shownOpacity = (locator: Locator) =>
  locator.evaluate((el) => {
    let opacity = 1
    for (let at: Element | null = el; at; at = at.parentElement) {
      opacity *= Number(getComputedStyle(at).opacity)
    }
    return opacity
  })

const columnWidth = async (page: Page) =>
  (await page.getByRole('main').boundingBox())!.width

test.describe('as an Admin', () => {
  test.beforeEach(({ network }) => network.use(signedInAsAdmin))

  test('lays the page out wider than every other page', async ({
    page,
    goto,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    await goto('/review', { waitUntil: 'hydration' })
    const shared = await columnWidth(page)

    await page
      .getByTestId('side-nav')
      .getByRole('link', { name: 'Admin' })
      .click()
    await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible()

    expect(await columnWidth(page)).toBeGreaterThan(shared)
  })

  test('shows a desktop the empty Metrics page', async ({
    page,
    goto,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(page.getByRole('main')).toMatchAriaSnapshot(`
      - main:
        - /children: deep-equal
        - region "Metrics":
          - paragraph: Admin
          - heading "Metrics" [level=1]
          - group "Filters":
            - text: Range
            - combobox "Range": Last 30 days
            - text: Engine
            - combobox "Engine": All engines
            - text: App version
            - combobox "App version": All versions
            - text: Opened in
            - combobox "Opened in": Installed or browser
          - heading "Nothing measured in the last 30 days" [level=2]
          - paragraph: Page timings appear here once Tucker records them. A wider range looks further back.
    `)
  })

  test('counts a move between two pages once the page that made it is hidden', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(...metricsRecorded())
    await goto('/today', { waitUntil: 'hydration' })

    await page
      .getByTestId('side-nav')
      .getByRole('link', { name: 'Foods' })
      .click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Foods' }),
    ).toBeVisible()
    // Waited on only so /admin reads after the send has landed, not asserted on.
    const sent = page.waitForResponse('**/api/metrics')
    await hidePage(page)
    await sent
    await page
      .getByTestId('side-nav')
      .getByRole('link', { name: 'Admin' })
      .click()

    // A long axis label wraps onto a second line, which reads as no space.
    const chart = page.getByRole('figure')
    await expect(chart).toContainText(/\/foods · Desktop · too few\s*\(n\s*1\)/)
    await expect(chart).toContainText(/\/foods · Phone · too few\s*\(n\s*0\)/)
    // Opening Tucker on Today (and its redirect to /) is a page load, LCP's to
    // measure, not a move — asserted after the label the same read draws.
    await expect(chart).not.toContainText('/ ·')
  })

  test('counts a move made on a phone as a phone', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(!isMobile, 'the move has to be made in the phone layout')
    network.use(...metricsRecorded())
    await goto('/today', { waitUntil: 'hydration' })
    await page.getByRole('link', { name: 'Review' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Review' }),
    ).toBeVisible()
    const sent = page.waitForResponse('**/api/metrics')
    await hidePage(page)
    await sent

    // Metrics are read at a desktop's width, so the Admin turns the phone round.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/admin')

    await expect(page.getByRole('figure')).toContainText(
      /\/review · Phone · too few\s*\(n\s*1\)/,
    )
  })

  test('puts the slowest page at the top', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    // The backend sends the slowest first.
    network.use(
      metricsReport([
        {
          route: '/review',
          layouts: [figures('phone', 910), figures('desktop', 260)],
        },
        {
          route: '/foods',
          layouts: [figures('phone', 540), figures('desktop', 210)],
        },
      ]),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    const chart = page.getByRole('figure')
    await expect(
      chart.getByText('/review · Phone', { exact: true }),
    ).toBeVisible()
    await expect(
      chart.getByText('/foods · Desktop', { exact: true }),
    ).toBeVisible()

    // Read in one pass: unovis redraws its axis, replacing the nodes under a locator.
    const topToBottom = await chart.evaluate((figure) =>
      [...figure.querySelectorAll('text')]
        .filter((t) => t.textContent?.startsWith('/'))
        .sort(
          (a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y,
        )
        .map((t) => t.textContent),
    )
    expect(topToBottom).toEqual([
      '/review · Phone',
      '/review · Desktop',
      '/foods · Phone',
      '/foods · Desktop',
    ])
  })

  // One scale, so a phone twice as slow draws a bar twice as long.
  test('draws phone and desktop on one scale', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport([
        {
          route: '/review',
          layouts: [figures('phone', 1000), figures('desktop', 500)],
        },
      ]),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.getByRole('figure')).toContainText('/review · Desktop')

    // Each bar's length is its parts' total, read in one pass for the axis' sake.
    const lengths = await page.evaluate(() => {
      const rows = new Map<number, number>()
      for (const path of document.querySelectorAll(
        '.route-timing path[class*="-bar"]',
      )) {
        const box = path.getBoundingClientRect()
        const y = Math.round(box.y)
        rows.set(y, (rows.get(y) ?? 0) + box.width)
      }
      return [...rows.entries()].sort(([a], [b]) => a - b).map(([, w]) => w)
    })
    expect(lengths).toHaveLength(2)
    expect(lengths[0]! / lengths[1]!).toBeCloseTo(2, 1)
  })

  test('colours each part as the legend colours it, and draws no bar where there are too few samples', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport([
        {
          route: '/review',
          layouts: [figures('phone', 910), tooFew('desktop', 3)],
        },
      ]),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.getByRole('figure')).toContainText('/review')

    const colours = {
      legend: await page.evaluate(() =>
        ['Server', 'Network + proxy', 'Render / JS'].map(
          (name) =>
            getComputedStyle(
              [...document.querySelectorAll('[aria-label="Parts"] li')]
                .find((li) => li.textContent?.trim() === name)!
                .querySelector('span')!,
            ).backgroundColor,
        ),
      ),
      // Left to right along the phone's bar, the one bar drawn.
      bars: await partColours(page),
    }
    // Stacked server, then network, then render, from the axis out, on the
    // phone's bar alone: the desktop's three samples draw none.
    expect(colours.bars).toEqual(colours.legend)
    await expect(page.getByRole('figure')).toContainText(
      /\/review · Desktop · too few\s*\(n\s*3\)/,
    )
    // Three parts told apart, not one colour twice.
    expect(new Set(colours.legend).size).toBe(3)
  })

  test('sets the four filters in one row above the chart', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport([{ route: '/review', layouts: [figures('phone', 400)] }]),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.getByRole('figure')).toContainText('/review · Phone')

    const filters = page.getByRole('group', { name: 'Filters' })
    const tops = await Promise.all(
      (await filters.getByRole('combobox').all()).map(
        async (c) => (await c.boundingBox())!.y,
      ),
    )
    expect(tops).toHaveLength(4)
    expect(new Set(tops).size).toBe(1)
    const row = (await filters.boundingBox())!
    const chart = (await page.getByRole('figure').boundingBox())!
    expect(row.y + row.height).toBeLessThanOrEqual(chart.y)
  })

  test('redraws the chart for a chosen engine, each part keeping its colour', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsBy(({ engine }) => [
        engine === 'webkit'
          ? { route: '/foods', layouts: [figures('phone', 1200)] }
          : { route: '/review', layouts: [figures('phone', 400)] },
      ]),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    const chart = page.getByRole('figure')
    await expect(chart).toContainText('/review · Phone')
    const before = await partColours(page)

    await page.getByRole('combobox', { name: 'Engine' }).click()
    await page.getByRole('option', { name: 'WebKit' }).click()

    await expect(chart).toContainText('/foods · Phone')
    await expect(chart).not.toContainText('/review')
    expect(await partColours(page)).toEqual(before)
    expect(new Set(before).size).toBe(3)
  })

  // ADR 0007: a refetch keeps the last answer up, dimmed, until the next lands.
  test('dims the last chart while the chosen filters are read, and lifts the dim once they answer', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport([{ route: '/review', layouts: [figures('phone', 400)] }]),
    )
    const read = held(
      'get',
      '/api/admin/metrics',
      (request) => new URL(request.url).searchParams.get('engine') === 'webkit',
    )
    network.use(read.handler)
    await goto('/admin', { waitUntil: 'hydration' })
    const chart = page.getByRole('figure')
    await expect(chart).toContainText('/review · Phone')
    expect(await shownOpacity(chart)).toBe(1)

    await page.getByRole('combobox', { name: 'Engine' }).click()
    await page.getByRole('option', { name: 'WebKit' }).click()

    await expect.poll(() => shownOpacity(chart)).toBe(0.5)
    await expect(chart).toContainText('/review · Phone')
    read.release()
    await expect.poll(() => shownOpacity(chart)).toBe(1)
  })

  // ADR 0007 holds the dim back 150 ms; the answer, once in, is not held back.
  test('lifts the dim the moment the answer lands, where only the dim waits', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport([{ route: '/review', layouts: [figures('phone', 400)] }]),
    )
    const read = held(
      'get',
      '/api/admin/metrics',
      (request) => new URL(request.url).searchParams.get('engine') === 'webkit',
    )
    network.use(read.handler)
    await goto('/admin', { waitUntil: 'hydration' })
    const chart = page.getByRole('figure')
    await expect(chart).toContainText('/review · Phone')

    await page.getByRole('combobox', { name: 'Engine' }).click()
    await page.getByRole('option', { name: 'WebKit' }).click()
    await expect.poll(() => shownOpacity(chart)).toBe(0.5)
    const dimmed = await chart.evaluateHandle((el) => {
      let at: Element | null = el
      while (at && getComputedStyle(at).opacity !== '0.5') at = at.parentElement
      return at!
    })
    const delay = () =>
      dimmed.evaluate((el) => getComputedStyle(el).transitionDelay)
    expect(await delay()).toBe('0.15s')

    read.release()

    await expect.poll(delay).toBe('0s')
  })

  // Else the last filters' empty state reads as the answer for the new ones.
  test('dims the last empty state while the chosen filters are read, then says what they found', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(metricsReport([]))
    const read = held(
      'get',
      '/api/admin/metrics',
      (request) => new URL(request.url).searchParams.get('engine') === 'webkit',
    )
    network.use(read.handler)
    await goto('/admin', { waitUntil: 'hydration' })
    const empty = page.getByRole('heading', {
      name: 'Nothing measured in the last 30 days',
    })
    await expect(empty).toBeVisible()

    await page.getByRole('combobox', { name: 'Engine' }).click()
    await page.getByRole('option', { name: 'WebKit' }).click()

    await expect.poll(() => shownOpacity(empty)).toBe(0.5)
    read.release()
    const unmatched = page.getByRole('heading', {
      name: 'Nothing matches these filters',
    })
    await expect.poll(() => shownOpacity(unmatched)).toBe(1)
    await expect(empty).toHaveCount(0)
  })

  test('states the exact figures of whichever bar is pointed at', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport([
        {
          route: '/review',
          layouts: [
            {
              ...figures('phone', 910),
              n: 48,
              p50: 640,
              p95: 1820,
              apiP75: 420,
              coldP75: 1310,
            },
            {
              ...figures('desktop', 260),
              n: 63,
              p50: 180,
              p95: 540,
              apiP75: 90,
              coldP75: null,
            },
          ],
        },
      ]),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.getByRole('figure')).toContainText('/review · Desktop')
    // Its heading is the one in bold: the axis names the same row in plain text.
    const heading = (row: string) => page.locator('strong', { hasText: row })

    // Any part of a bar states the whole bar's figures.
    await (await barPart(page, 'top', 2)).hover()
    await expect(heading('/review · Phone')).toBeVisible()
    await expect(
      page.getByText('n 48 · p50 640 · p75 910 · p95 1820 ms'),
    ).toBeVisible()
    await expect(page.getByText('api p75 420 · cold p75 1310 ms')).toBeVisible()

    await (await barPart(page, 'bottom', 0)).hover()
    await expect(heading('/review · Desktop')).toBeVisible()
    await expect(
      page.getByText('n 63 · p50 180 · p75 260 · p95 540 ms'),
    ).toBeVisible()
    await expect(
      page.getByText('api p75 90 ms · cold p75 too few'),
    ).toBeVisible()
  })

  test("states a release's p75 in each layout when its point is pointed at", async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [
          {
            route: '/foods',
            releases: [
              {
                version: '0.1.9',
                layouts: [
                  { layout: 'phone', n: 20, p75: 450 },
                  { layout: 'desktop', n: 3, p75: null },
                ],
              },
              {
                version: '0.1.10',
                layouts: [
                  { layout: 'phone', n: 14, p75: 380 },
                  { layout: 'desktop', n: 9, p75: 210 },
                ],
              },
            ],
          },
        ],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    const heading = (text: string) => page.locator('strong', { hasText: text })

    // Desktop had too few moves in 0.1.9, so that release has one point, phone's.
    await (await releasePoint(page, 0)).hover()
    await expect(heading('/foods · 0.1.9')).toBeVisible()
    await expect(page.getByText('Phone 450 ms')).toBeVisible()
    await expect(page.getByText('Desktop too few (n 3)')).toBeVisible()

    await (await releasePoint(page, 2)).hover()
    await expect(heading('/foods · 0.1.10')).toBeVisible()
    await expect(page.getByText('Phone 380 ms')).toBeVisible()
    await expect(page.getByText('Desktop 210 ms')).toBeVisible()
  })

  // unovis themes off its own attribute, which Tucker's `html.dark` does not set.
  test.describe('in dark mode', () => {
    test.use({ colorScheme: 'dark' })

    test("draws its grid and tooltip in the card's tokens, as the route chart does", async ({
      page,
      goto,
      network,
      isMobile,
    }) => {
      test.skip(isMobile, 'a phone shows the notice instead')
      network.use(
        metricsReport(
          [
            {
              route: '/foods',
              layouts: [figures('phone', 450), figures('desktop', 300)],
            },
          ],
          [],
          [
            {
              route: '/foods',
              releases: [
                {
                  version: '0.1.9',
                  layouts: [
                    { layout: 'phone', n: 20, p75: 450 },
                    { layout: 'desktop', n: 20, p75: 300 },
                  ],
                },
              ],
            },
          ],
        ),
      )
      await goto('/admin', { waitUntil: 'hydration' })
      await expect(page.locator('html')).toHaveClass(/dark/)
      const style = (chart: string, part: string, property: string) =>
        page
          .locator(`${chart} ${part}`)
          .first()
          .evaluate(
            (el, p) => getComputedStyle(el).getPropertyValue(p),
            property,
          )

      await (await barPart(page, 'top', 0)).hover()
      const route = {
        grid: await style('.route-timing', '[class$="-grid"] line', 'stroke'),
        tooltip: await style(
          '.route-timing',
          '[class*="-tooltip"]',
          'background-color',
        ),
      }
      await (await releasePoint(page, 0)).hover()
      const release = {
        grid: await style('.release-trend', '[class$="-grid"] line', 'stroke'),
        tooltip: await style(
          '.release-trend',
          '[class*="-tooltip"]',
          'background-color',
        ),
      }

      expect(release).toEqual(route)
    })
  })

  // A curve between two releases would draw p75s nobody measured, above and below both.
  test('joins one release to the next with a straight line', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [
          {
            route: '/foods',
            releases: [
              ['0.1.8', 900],
              ['0.1.9', 700],
              ['0.1.10', 1100],
            ].map(([version, p75]) => ({
              version: version as string,
              layouts: [
                { layout: 'phone' as const, n: 20, p75: p75 as number },
                { layout: 'desktop' as const, n: 20, p75: 300 },
              ],
            })),
          },
        ],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    const lines = page.locator('.release-trend path[class$="-linePath"]')
    await expect(lines.first()).toBeAttached()

    const commands = await lines.evaluateAll((paths) =>
      paths.flatMap((p) => p.getAttribute('d')?.match(/[A-Za-z]/g) ?? []),
    )
    expect(new Set(commands)).toEqual(new Set(['M', 'L']))
  })

  // The slowest release sits on the top of the shared scale, the fastest near its
  // floor: a point clipped there would read as a smaller figure.
  test('draws each point whole, the slowest release on the top of the scale included', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [
          releasesOf('/foods', [
            ['0.1.8', 1200, 0],
            ['0.1.9', 700, 250],
          ]),
        ],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.locator(POINTS).first()).toBeAttached()
    await page.locator('.release-trend').first().scrollIntoViewIfNeeded()

    // A point off the scale is not drawn at all; one cut by the plot's clip keeps
    // its bounding box, so each edge is hit-tested instead.
    const { drawn, clipped } = await page.evaluate((points) => {
      const shown = [...document.querySelectorAll(points)].filter(
        (p) => p.getBoundingClientRect().width > 0,
      )
      const cut = shown.filter((p) => {
        const b = p.getBoundingClientRect()
        const [cx, cy] = [b.left + b.width / 2, b.top + b.height / 2]
        const edges: [number, number][] = [
          [cx, b.top + 1],
          [cx, b.bottom - 1],
          [b.left + 1, cy],
          [b.right - 1, cy],
        ]
        return edges.some(([x, y]) => {
          const hit = document.elementFromPoint(x, y)
          return !hit || !(hit === p || p.contains(hit))
        })
      })
      return { drawn: shown.length, clipped: cut.length }
    }, POINTS)

    // Two releases, each with a phone and a desktop figure.
    expect(drawn).toBe(4)
    expect(clipped).toBe(0)
  })

  // On the plot's edge, the first release's point would sit on the time axis.
  test('keeps the first and last release in from the ends of their chart', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [
          releasesOf('/foods', [
            ['0.1.8', 1200, 300],
            ['0.1.9', 700, 250],
          ]),
        ],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.locator(POINTS).first()).toBeAttached()

    // The time axis' grid lines span the plot, so they mark its two ends. Each
    // release sits half a step in from them, a step being the gap between two.
    const inset = await page.evaluate((points) => {
      const chart = document.querySelector('.release-trend')!
      const grid = [...chart.querySelectorAll('[class$="-grid"] line')].map(
        (l) => l.getBoundingClientRect(),
      )
      const centres = [
        ...new Set(
          [...chart.querySelectorAll(points)]
            .map((p) => p.getBoundingClientRect())
            .filter((p) => p.width > 0)
            .map((p) => Math.round(p.left + p.width / 2)),
        ),
      ].sort((a, b) => a - b)
      const step = centres[1]! - centres[0]!
      return {
        left: (centres[0]! - Math.min(...grid.map((g) => g.left))) / step,
        right: (Math.max(...grid.map((g) => g.right)) - centres.at(-1)!) / step,
      }
    }, POINTS)

    expect(inset.left).toBeGreaterThan(0.4)
    expect(inset.right).toBeGreaterThan(0.4)
  })

  // One scale across the set, so a taller line is a slower page, not a zoomed one.
  test("labels each chart's releases, and puts every chart on one scale in ms", async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [
          releasesOf('/foods', [
            ['0.1.9', 1200, 900],
            ['0.1.10', 1100, 800],
          ]),
          releasesOf('/review', [
            ['0.1.9', 300, 200],
            ['0.1.10', 250, 150],
          ]),
        ],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.locator(POINTS).first()).toBeAttached()

    // Each chart draws two axes, the releases' then the times'. The times' axis
    // also draws its grid as blank ticks, which are left out; the releases' has
    // no grid, so a blank tick there is a release left unlabelled.
    const [foodsX, foodsY, reviewX, reviewY] = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.release-trend [class$="-axis-component"]',
        ),
      ].map((axis) =>
        [...axis.querySelectorAll('.tick text')].map((t) => t.textContent),
      ),
    )
    const labelled = (ticks: (string | null)[] | undefined) =>
      (ticks ?? []).filter(Boolean)

    expect(foodsX).toEqual(['0.1.9', '0.1.10'])
    expect(reviewX).toEqual(['0.1.9', '0.1.10'])
    expect(labelled(foodsY).length).toBeGreaterThan(1)
    for (const tick of labelled(foodsY)) expect(tick).toMatch(/^\d+ ms$/)
    expect(labelled(reviewY)).toEqual(labelled(foodsY))
  })

  // Colour is never the only signal, and the key draws what the lines do.
  test('draws each line as its legend entry shows it, the desktop one dashed', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [
          releasesOf('/foods', [
            ['0.1.9', 700, 300],
            ['0.1.10', 600, 250],
          ]),
        ],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.locator(POINTS).first()).toBeAttached()

    const strokes = (selector: string) =>
      page.evaluate(
        (s) =>
          [...document.querySelectorAll(s)].map((el) => {
            const style = getComputedStyle(el)
            return { stroke: style.stroke, dash: style.strokeDasharray }
          }),
        selector,
      )
    const legend = await strokes('[aria-label="Layouts"] line')
    const lines = await strokes('.release-trend path[class$="-linePath"]')

    expect(lines).toEqual(legend)
    expect(legend[0]!.dash).toBe('none')
    expect(legend[1]!.dash).not.toBe('none')
    expect(legend[0]!.stroke).not.toBe(legend[1]!.stroke)
  })

  test("puts the release and each layout's figure on a line of its own in the tooltip", async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [releasesOf('/foods', [['0.1.9', 700, 300]])],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })

    await (await releasePoint(page, 0)).hover()
    const tooltip = page.locator('.release-trend [class*="-tooltip"]')
    await expect(tooltip).toContainText('/foods · 0.1.9')

    expect((await tooltip.innerText()).split('\n')).toEqual([
      '/foods · 0.1.9',
      'Phone 700 ms',
      'Desktop 300 ms',
    ])
  })

  // A chart with nothing to plot would still draw a scale, of 0 to 1 ms, over nothing.
  test('says no release has a p75 yet, rather than drawing empty charts', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    const route = releasesOf('/foods', [['0.1.9', 0, 0]])
    route.releases[0]!.layouts = [
      { layout: 'phone', n: 4, p75: null },
      { layout: 'desktop', n: 1, p75: null },
    ]
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [route],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(
      page.getByText(
        'No release has a p75 yet: a layout needs five moves in a release for one.',
      ),
    ).toBeVisible()
    await expect(page.locator('.release-trend')).toHaveCount(0)
  })

  // Every deploy is a release, so a range can hold more than one chart has room to name.
  test("never draws two releases' names over each other", async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [
          releasesOf(
            '/foods',
            Array.from({ length: 24 }, (_, i) => [`0.1.${190 + i}`, 400, 300]),
          ),
        ],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.locator(POINTS).first()).toBeAttached()

    const overlaps = await page.evaluate(() => {
      const xAxis = document.querySelector(
        '.release-trend [class$="-axis-component"]',
      )!
      const shown = [...xAxis.querySelectorAll('.tick text')]
        .filter((t) => {
          const style = getComputedStyle(t)
          return (
            t.textContent && style.opacity !== '0' && style.display !== 'none'
          )
        })
        .map((t) => t.getBoundingClientRect())
        .sort((a, b) => a.left - b.left)
      return shown.filter((box, i) => i > 0 && box.left < shown[i - 1]!.right)
        .length
    })

    expect(overlaps).toBe(0)
  })

  // Wrapped onto lines of its own, each name would take the plot's height for itself.
  test('names each release it labels on one line, whatever the range holds', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [
          releasesOf(
            '/foods',
            Array.from({ length: 24 }, (_, i) => [`0.1.${190 + i}`, 400, 300]),
          ),
        ],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.locator(POINTS).first()).toBeAttached()

    // Measured against a times label, which is always one line.
    const { names, line } = await page.evaluate(() => {
      const [x, y] = document
        .querySelector('.release-trend')!
        .querySelectorAll('[class$="-axis-component"]')
      const heights = (axis: Element) =>
        [...axis.querySelectorAll('.tick text')]
          .filter((t) => t.textContent && getComputedStyle(t).opacity !== '0')
          .map((t) => t.getBoundingClientRect().height)
      return { names: heights(x!), line: Math.max(...heights(y!)) }
    })

    expect(names.length).toBeGreaterThan(1)
    for (const height of names) expect(height).toBeLessThanOrEqual(line)
  })

  // Nor a bridge drawn across it, which would claim a trend nobody measured.
  test('breaks a line at a release with too few moves, rather than joining across it', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    const route = releasesOf('/foods', [
      ['0.1.8', 700, 300],
      ['0.1.9', 650, 0],
      ['0.1.10', 600, 250],
    ])
    route.releases[1]!.layouts[1] = { layout: 'desktop', n: 2, p75: null }
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [route],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(page.locator(POINTS).first()).toBeAttached()

    const drawn = await page.evaluate(() => ({
      // Each line's runs: a new run starts at every M.
      runs: [
        ...document.querySelectorAll('.release-trend path[class$="-linePath"]'),
      ].map((p) => (p.getAttribute('d') ?? '').match(/M/g)?.length ?? 0),
      // unovis always draws a bridge across a gap, and shows it only on request.
      bridges: [
        ...document.querySelectorAll(
          '.release-trend path[class$="-interpolated-path"]',
        ),
      ].filter((p) => {
        const style = getComputedStyle(p)
        return style.opacity !== '0' && style.stroke !== 'none'
      }).length,
    }))

    // Phone's line runs unbroken; desktop's breaks at 0.1.9 into two runs.
    expect(drawn).toEqual({ runs: [1, 2], bridges: 0 })
  })

  // Too few moves is a gap in the line, never a zero it would dip to.
  test('draws no point for a release with too few moves in a layout', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(
      metricsReport(
        [{ route: '/foods', layouts: [figures('phone', 450)] }],
        [],
        [
          {
            route: '/foods',
            releases: ['0.1.8', '0.1.9', '0.1.10'].map((version) => ({
              version,
              layouts: [
                { layout: 'phone', n: 20, p75: 450 },
                version === '0.1.9'
                  ? { layout: 'desktop', n: 2, p75: null }
                  : { layout: 'desktop', n: 20, p75: 300 },
              ],
            })),
          },
        ],
      ),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    await expect(
      page.locator('.release-trend [class$="-point"]').first(),
    ).toBeAttached()

    const drawn = await page.evaluate(
      () =>
        [...document.querySelectorAll('.release-trend [class$="-point"]')]
          .map((p) => p.getBoundingClientRect())
          .filter((box) => box.width > 0).length,
    )
    expect(drawn).toBe(5)
  })

  // A phone is shown the notice alone, so it has no use for the chart's code or SVG.
  test('builds no chart on a phone, even with figures to chart', async ({
    page,
    goto,
    network,
    isMobile,
  }) => {
    test.skip(!isMobile, 'a desktop shows the chart')
    network.use(
      metricsReport([
        {
          route: '/review',
          layouts: [figures('phone', 910), figures('desktop', 260)],
        },
      ]),
    )
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(
      page.getByText('Metrics are built for a larger screen.'),
    ).toBeVisible()
    await expect(page.locator('.route-timing')).toHaveCount(0)
  })

  test('shows a phone only the notice that Metrics need a larger screen', async ({
    page,
    goto,
    isMobile,
  }) => {
    test.skip(!isMobile, 'a desktop shows the page')
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(page.getByRole('main')).toMatchAriaSnapshot(`
      - main:
        - /children: deep-equal
        - paragraph: Metrics are built for a larger screen.
    `)
  })
})

test('tells a User whose session has expired to sign back in at /admin, not that it is missing', async ({
  page,
  goto,
  expiredAccessOrigin,
}) => {
  await goto(`${expiredAccessOrigin.url}/admin`, { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: "You've been signed out" }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Page not found: /admin' }),
  ).toHaveCount(0)
})

test.describe('as a User who is not an Admin', () => {
  // Nuxt logs every not-found page it shows, an unknown path's included.
  test.use({ allowedErrors: [/Page not found: \/admin/] })

  test('meets the ordinary not-found page at /admin', async ({
    page,
    goto,
  }) => {
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(page.locator('body')).toMatchAriaSnapshot(`
      - /children: deep-equal
      - heading "404" [level=1]
      - 'heading "Page not found: /admin" [level=2]'
      - paragraph: "Page not found: /admin"
      - link "Go back home":
        - /url: /
    `)
  })

  test('meets it again on coming Back to /admin from the app', async ({
    page,
    goto,
  }) => {
    await goto('/admin', { waitUntil: 'hydration' })
    await page.getByRole('link', { name: 'Go back home' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Today' }),
    ).toBeVisible()

    // Back is a navigation inside the app, not a fresh load.
    await page.goBack()

    await expect(
      page.getByRole('heading', { name: 'Page not found: /admin' }),
    ).toBeVisible()
    // As an unknown path's not-found does: the address says where you are.
    await expect(page).toHaveURL(/\/admin$/)
  })
})
