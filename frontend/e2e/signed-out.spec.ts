import { expect, test } from './support/test'
import { primaryNavs } from './support/nav'

// The only layer that can reach this state: it needs a real redirect from a
// real server, which `page.route` cannot produce (see the fixture's helper).
// The suite's auto error-guard carries the other half — an uncaught exception
// on this path fails the test.

test('offers the way back in once the Access session has expired', async ({
  page,
  goto,
  expiredAccessOrigin,
}) => {
  await goto(`${expiredAccessOrigin.url}/`, { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: "You've been signed out" }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Sign back in' }),
  ).toHaveAttribute('href', '/api/version')
  await expect(primaryNavs(page)).toHaveCount(0)
})
