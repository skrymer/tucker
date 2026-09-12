import { expect, test } from './support/test'
import { offerInstall } from './support/install-offer'
import {
  mockNoActiveGoal,
  mockNoProfile,
  mockSummary,
} from './support/mock-api'
import { withOverflowNav } from './support/nav'

// The browser offers the install once per page load — in practice on Today, long
// before the user reaches Profile. The offer has to survive the SPA navigation,
// so the spec fires it on the earlier route; firing it on /profile asserts nothing.
test('offers the install after the browser made its one-shot offer on an earlier route', async ({
  page,
  goto,
}) => {
  await mockSummary(page)
  await mockNoProfile(page)
  await mockNoActiveGoal(page)

  await goto('/', { waitUntil: 'hydration' })
  await offerInstall(page)

  await withOverflowNav(page, (nav) =>
    nav.getByRole('link', { name: 'Profile' }).click(),
  )

  await expect(
    page.getByRole('button', { name: /install tucker/i }),
  ).toBeVisible()
})
