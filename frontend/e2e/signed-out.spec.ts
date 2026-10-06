import { expect, test } from './support/test'
import { primaryNavs } from './support/nav'
import { SIGN_IN_PATH } from '../app/utils/exits'

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
  // Spelled out rather than read from SIGN_IN_PATH: asserting a constant
  // against itself would pass whatever it were changed to.
  await expect(
    page.getByRole('link', { name: 'Sign back in' }),
  ).toHaveAttribute('href', '/sign-in')
  await expect(primaryNavs(page)).toHaveCount(0)
})

// Opens no page, so the suite's console guard observes nothing here.
test('the way back in lands in Tucker, not on the API that let it through', async ({
  page,
}) => {
  const response = await page.request.get(SIGN_IN_PATH, { maxRedirects: 0 })

  expect(response.status()).toBe(302)
  expect(response.headers()['location']).toBe('/')
})
