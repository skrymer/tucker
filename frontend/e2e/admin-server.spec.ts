import type { Locator } from '@playwright/test'
import { expect, test } from './support/test'
import { signedInAsAdmin } from '../test/mocks/handlers/identity'
import { health } from '../test/mocks/handlers/server'

// The server section of /admin (ADR 0039): built only on a desktop, as the page's
// metrics are; the baseline is a server three days up and healthy.

/** Where the centre of [mark] sits across [row]'s chart, 0 at its left, 1 at its right. */
async function across(chart: Locator, mark: Locator) {
  const [c, m] = await Promise.all([chart.boundingBox(), mark.boundingBox()])
  return (m!.x + m!.width / 2 - c!.x) / c!.width
}

test.describe('as an Admin, on a desktop', () => {
  test.beforeEach(({ network, isMobile }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    network.use(signedInAsAdmin)
  })

  test("reads the server's meters and each endpoint's time since the restart", async ({
    page,
    goto,
  }) => {
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(page.getByRole('region', { name: 'Server' }))
      .toMatchAriaSnapshot(`
      - region "Server":
        - /children: deep-equal
        - heading "Server" [level=2]
        - paragraph:
          - text: Since the last restart,
          - strong: 3 d 7 h
          - text: ago. The range and engine filters above don't apply.
        - text: Up
        - group "Process CPU": Process CPU · now 3.4% Tucker's own share
        - group "System CPU": System CPU · now 21% the host, as seen
        - group "Heap": Heap · now 182 MB used of 256 MB
        - group "Disk used": Disk used · now 7.7 GB of 39.1 GB, 31.4 GB free
        - group "GC pauses": GC pauses 4.8 s over 1,317 pauses since the restart
        - heading "Request time by endpoint, p50 to p95" [level=3]
        - list "Percentiles":
          - listitem: p50
          - listitem: p95
        - table "Request time by endpoint, p50 to p95":
          - rowgroup:
            - row "Endpoint p50 to p95 Requests 5xx":
              - columnheader "Endpoint"
              - columnheader "p50 to p95"
              - columnheader "Requests"
              - columnheader "5xx"
          - rowgroup:
            - row "GET /api/admin/metrics p50 88 ms, p95 412 ms 41 0":
              - cell "GET /api/admin/metrics"
              - cell "p50 88 ms, p95 412 ms"
              - cell "41"
              - cell "0"
            - 'row "GET /api/foods/barcode/{barcode} p50 214 ms, p95 380 ms 23 2"':
              - 'cell "GET /api/foods/barcode/{barcode}"'
              - cell "p50 214 ms, p95 380 ms"
              - cell "23"
              - cell "2"
            - row "GET /api/summary p50 19 ms, p95 74 ms 812 0":
              - cell "GET /api/summary"
              - cell "p50 19 ms, p95 74 ms"
              - cell "812"
              - cell "0"
            - row "GET /api/me p50 4 ms, p95 11 ms 977 0":
              - cell "GET /api/me"
              - cell "p50 4 ms, p95 11 ms"
              - cell "977"
              - cell "0"
            - 'row "DELETE /api/entries/{id} too few 3 0"':
              - 'cell "DELETE /api/entries/{id}"'
              - cell "too few"
              - cell "3"
              - cell "0"
            - row "POST /api/weekly-review too few 1 1":
              - cell "POST /api/weekly-review"
              - cell "too few"
              - cell "1"
              - cell "1"
    `)
  })

  test("states an endpoint's exact figures when its p50 to p95 is pointed at", async ({
    page,
    goto,
  }) => {
    await goto('/admin', { waitUntil: 'hydration' })

    const exact = 'p50 19 ms → p95 74 ms · 812 requests · 0 answered 5xx'
    const dumbbell = page
      .getByRole('row', { name: /\/api\/summary/ })
      .getByRole('cell')
      .nth(1)
    await dumbbell.hover()

    // The one drawn; Reka keeps an aria-hidden copy beside it for the description.
    await expect(
      page.locator('[data-slot="text"]', { hasText: exact }),
    ).toBeVisible()
    await expect(
      dumbbell.locator('[tabindex="0"]'),
    ).toHaveAccessibleDescription(exact)
  })

  test('draws every endpoint on one linear ms axis', async ({ page, goto }) => {
    await goto('/admin', { waitUntil: 'hydration' })
    const p95Of = (uri: string) => {
      const chart = page
        .getByRole('row', { name: new RegExp(uri) })
        .locator('svg')
        .first()
      return across(chart, chart.locator('circle').last())
    }

    // The slowest p95, 412 ms, on an axis rounded up to 500 ms.
    expect(await p95Of('/api/admin/metrics')).toBeCloseTo(412 / 500, 2)
    expect(await p95Of('/api/summary')).toBeCloseTo(74 / 500, 2)
  })

  test('colours health and nothing else: Up in the success colour, Down in the error colour', async ({
    page,
    goto,
    network,
  }) => {
    const colourOf = (token: string) =>
      page.evaluate((token) => {
        const probe = document.createElement('span')
        probe.style.color = `var(${token})`
        document.body.append(probe)
        const colour = getComputedStyle(probe).color
        probe.remove()
        return colour
      }, token)
    await goto('/admin', { waitUntil: 'hydration' })
    const card = page.getByRole('region', { name: 'Server' })
    await expect(card.getByText('Up', { exact: true })).toHaveCSS(
      'color',
      await colourOf('--ui-success'),
    )

    network.use(health({ status: 'DOWN' }))
    await page.reload()

    await expect(card.getByText('Down', { exact: true })).toHaveCSS(
      'color',
      await colourOf('--ui-error'),
    )
  })
})
