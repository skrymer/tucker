import { expect, test } from './support/test'
import {
  mockMe,
  mockNoProfile,
  mockSummary,
  mockFoods,
  mockNoActiveGoal,
  mockWeightApi,
  mockWeightList,
} from './support/mock-api'

const EMAIL = 'tester@tucker.invalid'

test.describe('the identity byline', () => {
  test.beforeEach(async ({ page }) => {
    await mockMe(page, EMAIL)
    await mockNoProfile(page)
  })

  test('names the person whose data is on screen', async ({ page, goto }) => {
    await goto('/profile', { waitUntil: 'hydration' })

    await expect(page.getByText(`Signed in as ${EMAIL}`)).toBeVisible()
  })

  test('points Sign out at Cloudflare Access, outside the SPA', async ({
    page,
    goto,
  }) => {
    // Asserting the destination, not the outcome: `/cdn-cgi/access/logout` is
    // served by Cloudflare's edge, so it exists only on the deployed origin and
    // 404s here. That the session actually ends is verifiable there alone — no
    // suite in this repo can prove it. That the service worker lets the
    // navigation reach the network at all is held by app/utils/exits.test.ts.
    await goto('/profile', { waitUntil: 'hydration' })

    await expect(page.getByRole('link', { name: 'Sign out' })).toHaveAttribute(
      'href',
      '/cdn-cgi/access/logout',
    )
  })
})

// Multi-user is deliberately one line in one place, so its absence everywhere
// else is asserted rather than assumed. One test per route, not a loop: a
// failure has to name the page it happened on. Each asserts its heading first —
// without that anchor, "no identity chrome" would also pass on a page that
// never rendered at all.
// Every other page there is: the four sibling nav tabs plus /profile's own
// sub-route, which is the one place a byline could plausibly leak by being on
// the wrong side of a layout.
const OTHER_PAGES = [
  { path: '/', heading: 'Today' },
  { path: '/foods', heading: 'Foods' },
  { path: '/check', heading: 'Check' },
  { path: '/review', heading: 'Review' },
  { path: '/profile/weight', heading: 'Weight history' },
]

for (const { path, heading } of OTHER_PAGES) {
  test(`${path} carries no identity chrome`, async ({ page, goto }) => {
    // Enough of each page's own data to let it actually render — the heading
    // assertion below is what makes the two absence assertions mean something.
    await mockMe(page, EMAIL)
    await mockSummary(page)
    await mockFoods(page)
    await mockNoActiveGoal(page)
    await mockWeightApi(page)
    await mockWeightList(page)

    await goto(path, { waitUntil: 'hydration' })

    // level 1 so this is the page's own title, not a section heading that
    // happens to contain the same word ("Logged today").
    await expect(
      page.getByRole('heading', { name: heading, level: 1 }),
    ).toBeVisible()
    // Sign out first, and it is the load-bearing one: it renders with the
    // component, so its absence is meaningful the moment the page settles. The
    // address only appears after /api/me resolves, so that assertion would pass
    // on the first poll even if the byline were mounted here.
    await expect(page.getByRole('link', { name: 'Sign out' })).toHaveCount(0)
    await expect(page.getByText(/signed in as/i)).toHaveCount(0)
  })
}
