import { expect, test } from './support/test'
import { mockSummary } from './support/mock-api'
import { visibleNav } from './support/nav'

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

  test('opens Today for a reminder that deep-links to /today', async ({
    page,
    goto,
  }) => {
    // The path pre-#178 reminders baked into the tray; see app/pages/today.vue.
    await goto('/today', { waitUntil: 'hydration' })

    await expect(page).toHaveURL(({ pathname }) => pathname === '/')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Today' }),
    ).toBeVisible()
  })

  test('carries Today, Log and Review, with the rest behind More', async ({
    page,
    goto,
  }) => {
    await page.setViewportSize(PHONE)
    await goto('/', { waitUntil: 'hydration' })

    const bar = visibleNav(page)
    await expect(bar.getByRole('link')).toHaveText(['Today', 'Log', 'Review'])

    await bar.getByRole('button', { name: 'More' }).click()

    const sheet = page.getByRole('dialog', { name: 'More' })
    await expect(sheet.getByRole('link')).toHaveText([
      'Foods',
      'Check',
      'Profile',
    ])
  })

  test('lays the same overflow out in place in the side navigation', async ({
    page,
    goto,
  }) => {
    // A side rail has the room, so there is no sheet to open — and no More
    // button either, which is what keeps the two shells honest about it.
    await page.setViewportSize(DESKTOP)
    await goto('/', { waitUntil: 'hydration' })

    const rail = visibleNav(page)
    await expect(
      rail.getByRole('group', { name: 'More' }).getByRole('link'),
    ).toHaveText(['Foods', 'Check', 'Profile'])
    await expect(rail.getByRole('button', { name: 'More' })).toBeHidden()
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
