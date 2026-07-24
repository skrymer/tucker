import { expect, test } from './support/test'
import { mockProfile } from './support/mock-api'

// The real @nuxtjs/color-mode effect — the `.dark` class flipping on <html> and
// the choice persisting via cookie across a reload — only runs in a real browser
// (the component test mocks the color-mode boundary, ADR 0013). `/design` is used
// to exercise the behaviour because it has no API dependencies; a final test
// covers the control's placement on the `/profile` feature surface. Every test
// runs on both the Desktop and Mobile projects.

test.describe('Appearance follows the OS by default', () => {
  test.use({ colorScheme: 'dark' })

  test('a fresh device with a dark OS starts in dark (System)', async ({
    page,
    goto,
  }) => {
    await goto('/design', { waitUntil: 'hydration' })

    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect(
      page.getByRole('tab', { name: /system/i, selected: true }),
    ).toBeVisible()
  })

  test('pinning Light overrides a dark OS and survives a reload', async ({
    page,
    goto,
  }) => {
    await goto('/design', { waitUntil: 'hydration' })

    await page.getByRole('tab', { name: /light/i }).click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    // The browser chrome follows the pinned mode, not the (dark) OS.
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#eff6f1',
    )

    await page.reload()
    await expect(page.getByRole('tab', { name: /light/i })).toBeVisible()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  })
})

test.describe('Appearance can pin dark over a light OS', () => {
  test.use({ colorScheme: 'light' })

  test('pinning Dark switches to dark and survives a reload', async ({
    page,
    goto,
  }) => {
    await goto('/design', { waitUntil: 'hydration' })
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

    await page.getByRole('tab', { name: /dark/i }).click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    // Exactly one reactive theme-color meta reflects the mode — not a stale
    // media pair (which Unhead would dedupe and clobber).
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#0f1a15',
    )

    await page.reload()
    await expect(page.getByRole('tab', { name: /dark/i })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  })
})

test('the Appearance control sits on the Profile page', async ({
  page,
  goto,
}) => {
  await mockProfile(page, {
    sex: 'MALE',
    birthDate: '1986-05-22',
    heightCm: 180,
  })

  await goto('/profile', { waitUntil: 'hydration' })

  await expect(page.getByRole('heading', { name: /appearance/i })).toBeVisible()
  await expect(page.getByRole('tab', { name: /light/i })).toBeVisible()
  await expect(page.getByRole('tab', { name: /dark/i })).toBeVisible()
  await expect(page.getByRole('tab', { name: /system/i })).toBeVisible()
})
