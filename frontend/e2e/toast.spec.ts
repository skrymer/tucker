import { expect, test } from '@nuxt/test-utils/playwright'

const PHONE = { width: 375, height: 812 }

test('a toast floats clear of the bottom tab bar at phone width', async ({
  page,
  goto,
}) => {
  // GET returns a saved profile; PUT echoes the submitted body back so that
  // saving succeeds and fires the "Profile saved" toast.
  let saved: Record<string, unknown> = {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
  }
  await page.route('**/api/profile', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ json: saved })
    if (req.method() === 'PUT') {
      saved = req.postDataJSON()
      return route.fulfill({ json: saved })
    }
    return route.fallback()
  })

  await page.setViewportSize(PHONE)
  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByLabel(/height/i).fill('182')
  await page.getByRole('button', { name: /save profile/i }).click()

  const toast = page
    .getByRole('region', { name: /notifications/i })
    .getByRole('listitem')
    .filter({ hasText: 'Profile saved' })
  await expect(toast).toBeVisible()

  const bottomNav = page.getByTestId('bottom-nav')
  await expect(bottomNav).toBeVisible()

  // The toast must sit entirely above the bottom navigation — its lower edge
  // no further down the page than the nav's top edge.
  await expect(async () => {
    const toastBox = await toast.boundingBox()
    const navBox = await bottomNav.boundingBox()
    expect(toastBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(navBox!.y)
  }).toPass()
})
