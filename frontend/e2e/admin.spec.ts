import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { signedInAsAdmin } from '../test/mocks/handlers/identity'

// The Metrics page's layout (ADR 0039): a column wider than the shared one on a
// desktop, a one-line notice on a phone, and the ordinary not-found page for a
// User who is not an Admin.

const columnWidth = async (page: Page) =>
  (await page.getByRole('main').boundingBox())!.width

test.describe('as an Admin', () => {
  test.beforeEach(({ network }) => network.use(signedInAsAdmin))

  test('lays the page out wider than every other page', async ({
    page,
    goto,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    await goto('/review', { waitUntil: 'hydration' })
    const shared = await columnWidth(page)

    await page
      .getByTestId('side-nav')
      .getByRole('link', { name: 'Admin' })
      .click()
    await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible()

    expect(await columnWidth(page)).toBeGreaterThan(shared)
  })

  test('shows a desktop the empty Metrics page', async ({
    page,
    goto,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone shows the notice instead')
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(page.getByRole('main')).toMatchAriaSnapshot(`
      - main:
        - /children: deep-equal
        - paragraph: Admin
        - heading "Metrics" [level=1]
        - heading "Nothing measured yet" [level=2]
        - paragraph: Page timings appear here once Tucker starts recording them.
    `)
  })

  test('shows a phone only the notice that Metrics need a larger screen', async ({
    page,
    goto,
    isMobile,
  }) => {
    test.skip(!isMobile, 'a desktop shows the page')
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(page.getByRole('main')).toMatchAriaSnapshot(`
      - main:
        - /children: deep-equal
        - paragraph: Metrics are built for a larger screen.
    `)
  })
})

test('tells a User whose session has expired to sign back in at /admin, not that it is missing', async ({
  page,
  goto,
  expiredAccessOrigin,
}) => {
  await goto(`${expiredAccessOrigin.url}/admin`, { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: "You've been signed out" }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Page not found: /admin' }),
  ).toHaveCount(0)
})

test.describe('as a User who is not an Admin', () => {
  // Nuxt logs every not-found page it shows, an unknown path's included.
  test.use({ allowedErrors: [/Page not found: \/admin/] })

  test('meets the ordinary not-found page at /admin', async ({
    page,
    goto,
  }) => {
    await goto('/admin', { waitUntil: 'hydration' })

    await expect(page.locator('body')).toMatchAriaSnapshot(`
      - /children: deep-equal
      - heading "404" [level=1]
      - 'heading "Page not found: /admin" [level=2]'
      - paragraph: "Page not found: /admin"
      - link "Go back home":
        - /url: /
    `)
  })

  test('meets it again on coming Back to /admin from the app', async ({
    page,
    goto,
  }) => {
    await goto('/admin', { waitUntil: 'hydration' })
    await page.getByRole('link', { name: 'Go back home' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Today' }),
    ).toBeVisible()

    // Back is a navigation inside the app, not a fresh load.
    await page.goBack()

    await expect(
      page.getByRole('heading', { name: 'Page not found: /admin' }),
    ).toBeVisible()
    // As an unknown path's not-found does: the address says where you are.
    await expect(page).toHaveURL(/\/admin$/)
  })
})
