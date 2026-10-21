import { test, expect } from './support/smoke-test'

// The Admin role end to end (ADR 0039): `TUCKER_ADMIN_EMAILS` in the smoke stack
// lists admin@tucker.invalid, the backend grants the role from a real assertion,
// and `/api/me` decides what the page draws. The mocked suite answers `/api/me`
// itself, so it would go on passing if the backend never granted the role.

test.describe('an Admin', () => {
  test.use({ browserEmail: 'admin@tucker.invalid' })

  test('reaches the Metrics page from the side nav', async ({
    page,
    goto,
    isMobile,
  }) => {
    test.skip(isMobile, 'the Admin item is on the desktop side nav only')
    await goto('/', { waitUntil: 'hydration' })

    await page
      .getByTestId('side-nav')
      .getByRole('link', { name: 'Admin' })
      .click()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Metrics' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Nothing measured yet' }),
    ).toBeVisible()
  })

  test('is told on a phone that Metrics need a larger screen', async ({
    page,
    goto,
    isMobile,
  }) => {
    test.skip(!isMobile, 'a desktop shows the page')
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(
      page.getByText('Metrics are built for a larger screen.'),
    ).toBeVisible()
  })
})

test.describe('a User who is not an Admin', () => {
  // Nuxt logs every not-found page it shows, an unknown path's included.
  test.use({ allowedErrors: [/Page not found: \/admin/] })

  test('sees no Admin item and meets not-found at /admin', async ({
    page,
    goto,
  }) => {
    await goto('/', { waitUntil: 'hydration' })
    // The nav has drawn once Review is on screen, in whichever bar this viewport
    // shows. Text, not role, for the absence: it reaches the bar that is hidden.
    await expect(page.getByRole('link', { name: 'Review' })).toBeVisible()
    await expect(page.getByText('Admin', { exact: true })).toHaveCount(0)

    await goto('/admin', { waitUntil: 'hydration' })

    await expect(
      page.getByRole('heading', { name: 'Page not found: /admin' }),
    ).toBeVisible()
  })
})
