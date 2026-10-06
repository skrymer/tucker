import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { food } from '../test/food-fixtures'
import { catalogOf } from '../test/mocks/handlers/foods'
import { pickFoodToLog } from './support/log-page'

// The Log column must not move sideways under the User's pointer — not when a
// Tag narrows the page short enough to drop its scrollbar, and not when a sheet
// locks the page's scroll. Both only happen with *classic* scrollbars, which
// headless Chromium hides by default, so this file asks for them back.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

const DINNER = { id: 30, name: 'dinner' }

/** Enough Foods that "All foods" scrolls, one of them tagged. */
const CATALOG = Array.from({ length: 30 }, (_, i) =>
  food({
    id: i + 1,
    name: `Catalog food ${String(i + 1).padStart(2, '0')}`,
    tags: i === 0 ? [DINNER] : [],
  }),
)

// By text rather than role: an open sheet hides the page behind it from the
// accessibility tree, and this is measured while one is open.
const columnX = async (page: Page) =>
  (await page
    .locator('main button', { hasText: 'Log an estimate instead' })
    .boundingBox())!.x

test.beforeEach(({ isMobile, network }) => {
  // Phones draw overlay scrollbars, which take no room to begin with.
  test.skip(isMobile, 'overlay scrollbars reserve no width')
  // Nothing ranked — the baseline's — so the catalog is the whole page.
  network.use(catalogOf(CATALOG))
})

test('keeps the column still when a Tag narrows the page short enough to stop scrolling', async ({
  page,
  goto,
}) => {
  await goto('/log', { waitUntil: 'hydration' })
  const before = await columnX(page)

  await page
    .getByRole('group', { name: 'Filter by tag' })
    .getByRole('button', { name: 'dinner' })
    .click()
  await expect(page.getByRole('region', { name: 'dinner foods' })).toBeVisible()

  expect(await columnX(page)).toBe(before)
})

test('keeps the column still while a sheet holds the page', async ({
  page,
  goto,
}) => {
  await goto('/log', { waitUntil: 'hydration' })
  const before = await columnX(page)

  const sheet = await pickFoodToLog(page, {
    section: 'All foods',
    food: 'Catalog food 05',
  })
  await expect(sheet).toBeVisible()

  expect(await columnX(page)).toBe(before)
})
