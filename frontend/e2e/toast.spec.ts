import { expect, test } from './support/test'

const PHONE = { width: 375, height: 812 }
const DESKTOP = { width: 1280, height: 800 }

// A saved profile so the form loads populated; tests override the PUT per-case.
const SAVED = { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 }

function toastRegion(page: import('@playwright/test').Page) {
  return page.getByRole('region', { name: /notifications/i })
}

test('at phone width a failed save anchors the error toast to the top, clear of the sheet and keyboard zone', async ({
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

  // On a phone the bottom belt is owned by the open sheet's inputs and submit
  // button, the FAB/tab bar, and — whenever a field is focused — the software
  // keyboard. So the toast is anchored to the top: its whole body sits in the
  // top half of the viewport, never over the input the user was filling.
  await expect(async () => {
    const toastBox = await toast.boundingBox()
    expect(toastBox).not.toBeNull()
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(PHONE.height / 2)
  }).toPass()
})

test('at desktop width the error toast stays at the bottom, where nothing competes for the corner', async ({
  page,
  goto,
}) => {
  await page.route('**/api/profile', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ json: SAVED })
    if (req.method() === 'PUT')
      return route.fulfill({ status: 500, json: { message: 'boom' } })
    return route.fallback()
  })

  await page.setViewportSize(DESKTOP)
  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByLabel(/height/i).fill('182')
  await page.getByRole('button', { name: /save profile/i }).click()

  const toast = toastRegion(page)
    .getByRole('listitem')
    .filter({ hasText: 'Could not save profile' })
  await expect(toast).toBeVisible()

  // Desktop has no keyboard to dodge and the form is a page, not a bottom
  // sheet, so the toast keeps the conventional bottom-right corner: its top
  // edge is in the bottom half of the viewport and its left edge past the
  // horizontal midpoint. Pinning both axes (not just "bottom") means the phone
  // and desktop assertions specify genuinely different anchors, so an inverted
  // breakpoint or a phone override leaking to desktop fails here.
  await expect(async () => {
    const toastBox = await toast.boundingBox()
    expect(toastBox).not.toBeNull()
    expect(toastBox!.y).toBeGreaterThanOrEqual(DESKTOP.height / 2)
    expect(toastBox!.x).toBeGreaterThanOrEqual(DESKTOP.width / 2)
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
