import { expect, test } from '@nuxt/test-utils/playwright'
import { mockSummary } from './support/mock-api'

const PHONE = { width: 375, height: 812 }
const DESKTOP = { width: 1280, height: 800 }

test.describe('app shell navigation', () => {
  // The Today page (/) fetches the summary; stub it so the shell renders.
  test.beforeEach(async ({ page }) => {
    await mockSummary(page)
  })

  test('shows the bottom tab bar on a phone-width viewport', async ({
    page,
    goto,
  }) => {
    await page.setViewportSize(PHONE)
    await goto('/', { waitUntil: 'hydration' })

    await expect(page.getByTestId('bottom-nav')).toBeVisible()
    await expect(page.getByTestId('side-nav')).toBeHidden()
  })

  test('shows the side navigation on a desktop-width viewport', async ({
    page,
    goto,
  }) => {
    await page.setViewportSize(DESKTOP)
    await goto('/', { waitUntil: 'hydration' })

    await expect(page.getByTestId('side-nav')).toBeVisible()
    await expect(page.getByTestId('bottom-nav')).toBeHidden()
  })

  test('opens the selected destination while the shell persists', async ({
    page,
    goto,
  }) => {
    await page.setViewportSize(DESKTOP)
    await goto('/', { waitUntil: 'hydration' })

    const sideNav = page.getByTestId('side-nav')
    await sideNav.getByRole('link', { name: 'Foods' }).click()

    await expect(page).toHaveURL(/\/foods$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Foods' }),
    ).toBeVisible()
    // The shell persists across navigation and marks the open destination active.
    await expect(sideNav).toBeVisible()
    await expect(sideNav.getByRole('link', { name: 'Foods' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
