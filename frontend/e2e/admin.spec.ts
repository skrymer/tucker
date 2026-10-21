import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { signedInAsAdmin } from '../test/mocks/handlers/identity'
import { metricsRecorded, metricsReport } from '../test/mocks/handlers/metrics'
import { hidePage } from './support/visibility'

// The Metrics page's layout (ADR 0039): a column wider than the shared one on a
// desktop, a one-line notice on a phone, and the ordinary not-found page for a
// User who is not an Admin.

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
        - paragraph: Admin
        - heading "Metrics" [level=1]
        - heading "Nothing measured yet" [level=2]
        - paragraph: Page timings appear here once Tucker starts recording them.
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
    await expect(page.getByRole('figure')).toContainText(
      /\/foods \(Phone too few: 0,\s*Desktop too few: 1\)/,
    )
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
      /\/review \(Phone too few: 1,\s*Desktop too few: 0\)/,
    )
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
            { layout: 'phone', n: 48, p50: 640, p75: 910, p95: 1820 },
            { layout: 'desktop', n: 63, p50: 180, p75: 260, p95: 540 },
          ],
        },
      ]),
    )
    await goto('/admin', { waitUntil: 'hydration' })
    // unovis draws the bars as bare paths, with no role or name to find them by.
    const bars = page.locator('.route-timing path[class*="-bar"]')

    await bars.nth(0).hover()
    await expect(page.getByText('/review · Phone')).toBeVisible()
    await expect(
      page.getByText('n 48 · p50 640 · p75 910 · p95 1820 ms'),
    ).toBeVisible()

    await bars.nth(1).hover()
    await expect(page.getByText('/review · Desktop')).toBeVisible()
    await expect(
      page.getByText('n 63 · p50 180 · p75 260 · p95 540 ms'),
    ).toBeVisible()
  })

  // Opening Tucker is a page load, LCP's to measure, not a move between pages.
  test('does not count the page a visit opened on as a move', async ({
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
    const sent = page.waitForResponse('**/api/metrics')
    await hidePage(page)
    await sent
    await page
      .getByTestId('side-nav')
      .getByRole('link', { name: 'Admin' })
      .click()

    // After the label the same read draws, so the absence is not just early.
    const chart = page.getByRole('figure')
    await expect(chart).toContainText('/foods')
    await expect(chart).not.toContainText('/ (')
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
