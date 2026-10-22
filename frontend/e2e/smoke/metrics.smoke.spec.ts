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

// Resource Timing exposes Server-Timing only for a same-origin response, which `/api`
// is through the proxy: this is the proxy passing the header on, and the browser
// reading it, neither of which the mocked suite has.
test("an api response states the server's own time to the page", async ({
  page,
  goto,
  isMobile,
}) => {
  test.skip(isMobile, 'the proxy and the header are the same at any width')
  await goto('/', { waitUntil: 'hydration' })
  await expect(
    page.getByRole('heading', { level: 1, name: 'Today' }),
  ).toBeVisible()

  const serverTimes = await page.evaluate(() =>
    (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((e) => new URL(e.name).pathname.startsWith('/api/'))
      .map((e) => e.serverTiming.find((t) => t.name === 'app')?.duration),
  )

  expect(serverTimes.length).toBeGreaterThan(0)
  for (const ms of serverTimes) expect(ms).toBeGreaterThan(0)
})

// A User's moves, counted in their own layout, reach the Admin. A browser keeps 250
// Resource Timing entries and then drops the rest, so a session past its 250th
// request would wait on nothing: the buffer is shut from the start here, and a move
// still measures its wait.
test("a User's moves reach the Admin with their wait on the api, however many requests came before", async ({
  page,
  goto,
  browser,
  isMobile,
}) => {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(0))
  await goto('/', { waitUntil: 'hydration' })
  // Five moves to Review, enough for a figure.
  for (let i = 0; i < 5; i++) {
    await page.getByRole('link', { name: 'Review' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Review' }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Today' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Today' }),
    ).toBeVisible()
  }
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
    const layout = isMobile ? 'Phone' : 'Desktop'
    await expect(adminPage.getByRole('figure')).toContainText(
      `/review · ${layout}`,
    )

    // Review's bar is the one level with its label (Today's moves draw one too).
    const bars = '.route-timing path[class*="-bar"]'
    const review = await adminPage.evaluate(
      ([bars, label]) => {
        const text = [...document.querySelectorAll('.route-timing text')].find(
          (t) => t.textContent === label,
        )!
        const { y, height } = text.getBoundingClientRect()
        const middle = y + height / 2
        return [...document.querySelectorAll(bars!)].findIndex((p) => {
          const box = p.getBoundingClientRect()
          return box.top <= middle && middle <= box.bottom
        })
      },
      [bars, `/review · ${layout}`],
    )
    await adminPage.locator(bars).nth(review).hover()
    await expect(
      adminPage.locator('strong', { hasText: `/review · ${layout}` }),
    ).toBeVisible()
    await expect(adminPage.getByText(/api p75 [1-9]\d* ms/)).toBeVisible()
  } finally {
    await admin.close()
  }
})
