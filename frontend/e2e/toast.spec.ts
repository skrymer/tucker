import { expect, test } from '@nuxt/test-utils/playwright'

const PHONE = { width: 375, height: 812 }

// A saved profile so the form loads populated; tests override the PUT per-case.
const SAVED = { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 }

function toastRegion(page: import('@playwright/test').Page) {
  return page.getByRole('region', { name: /notifications/i })
}

test('a failed save shows a persistent error toast that clears the bottom tab bar at phone width', async ({
  page,
  goto,
}) => {
  // GET returns the saved profile; PUT fails so the save surfaces the
  // persistent error toast instead of dismissing silently.
  await page.route('**/api/profile', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ json: SAVED })
    if (req.method() === 'PUT')
      return route.fulfill({ status: 500, json: { message: 'boom' } })
    return route.fallback()
  })

  await page.setViewportSize(PHONE)
  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByLabel(/height/i).fill('182')
  await page.getByRole('button', { name: /save profile/i }).click()

  const toast = toastRegion(page)
    .getByRole('listitem')
    .filter({ hasText: 'Could not save profile' })
  await expect(toast).toBeVisible()
  // It carries a Retry affordance and persists (no auto-dismiss to count down).
  await expect(toast.getByRole('button', { name: /retry/i })).toBeVisible()

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

test('the error toast Retry re-submits the save and dismisses once it succeeds', async ({
  page,
  goto,
}) => {
  // First PUT fails, the next succeeds — so Retry drives failure → success.
  let putAttempts = 0
  await page.route('**/api/profile', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ json: SAVED })
    if (req.method() === 'PUT') {
      putAttempts += 1
      if (putAttempts === 1)
        return route.fulfill({ status: 500, json: { message: 'boom' } })
      return route.fulfill({ json: req.postDataJSON() })
    }
    return route.fallback()
  })

  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByLabel(/height/i).fill('182')
  await page.getByRole('button', { name: /save profile/i }).click()

  const toast = toastRegion(page)
    .getByRole('listitem')
    .filter({ hasText: 'Could not save profile' })
  await expect(toast).toBeVisible()

  await toast.getByRole('button', { name: /retry/i }).click()

  // The retried save succeeds, so the persistent error toast is dismissed.
  await expect(toast).toHaveCount(0)
  expect(putAttempts).toBe(2)
})
