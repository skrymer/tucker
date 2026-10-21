import { test, expect } from './support/smoke-test'
import { hidePage } from '../support/visibility'
import {
  ACCESS_ASSERTION_HEADER,
  mintAccessToken,
} from '../../scripts/access-token.mjs'

// Tucker measuring itself end to end (ADR 0038): the browser's queue, the CSRF
// proof the real backend checks, the `metric_event` row, and the Admin's report
// read back through the chart (ADR 0039). The mocked suite answers both ends
// itself, so it would go on passing if a send were refused.

test("a User's move between two pages is counted on the Admin's Metrics page", async ({
  page,
  goto,
  browser,
  isMobile,
}) => {
  await goto('/', { waitUntil: 'hydration' })
  await page.getByRole('link', { name: 'Review' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Review' }),
  ).toBeVisible()
  const sent = page.waitForResponse(
    (r) => r.url().endsWith('/api/metrics') && r.request().method() === 'POST',
  )
  await hidePage(page)
  // Taken, not refused: the send proved it came from Tucker's own page (ADR 0025).
  expect((await sent).status()).toBe(204)

  // The Admin reads Metrics in a browser of their own, at a desktop's width.
  const admin = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  try {
    const assertion = await mintAccessToken({ email: 'admin@tucker.invalid' })
    const adminPage = await admin.newPage()
    await adminPage.route('**/api/**', (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          [ACCESS_ASSERTION_HEADER]: assertion,
        },
      }),
    )
    await adminPage.goto(new URL('/admin', page.url()).href)

    await expect(adminPage.getByRole('figure')).toContainText(
      isMobile
        ? /\/review \(Phone too few: 1,\s*Desktop too few: 0\)/
        : /\/review \(Phone too few: 0,\s*Desktop too few: 1\)/,
    )
  } finally {
    await admin.close()
  }
})
