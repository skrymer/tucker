import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import {
  mockFoods,
  mockFrequentFoods,
  mockFrequentFoodsError,
  mockProfile,
  mockWeighedEntryLog,
} from './support/mock-api'
import { food, recipe } from '../test/food-fixtures'
import { isoShiftDays, localTodayIso } from './support/date'

// The Log destination: Frequent Foods as a grid, an estimate as its peer, and
// nothing else that creates an Entry (ADR 0028).

const TRACKING = {
  sex: 'MALE',
  birthDate: '1990-06-15',
  heightCm: 180,
  tracksCalories: true,
}

const OATS = food({
  id: 1,
  name: 'Rolled oats',
  caloriesPer100g: 379,
  proteinPer100g: 13.2,
})
const EGGS = food({
  id: 2,
  name: 'Free-range eggs',
  caloriesPer100g: 143,
  proteinPer100g: 12.6,
})
const CHILLI = recipe({
  id: 3,
  name: 'Weekday chilli',
  caloriesPer100g: 121,
  proteinPer100g: 11.4,
  cookedWeightG: 900,
  ingredientCount: 7,
})

const RANKED = [EGGS, OATS, CHILLI]

// In the catalog and out of the rotation — the Food the filter exists to find.
const TUNA = food({
  id: 4,
  name: 'Tinned tuna',
  caloriesPer100g: 116,
  proteinPer100g: 25.5,
})

/**
 * A full rotation — the ten the grid is sized for. Generated rather than named,
 * because the only property the test reads is that there are ten of them with
 * names long enough to wrap a cell.
 */
const TEN = Array.from({ length: 10 }, (_, i) =>
  food({
    id: i + 1,
    name: `Frequent food number ${i + 1}`,
    caloriesPer100g: 200 + i,
    proteinPer100g: 10 + i,
  }),
)

test.beforeEach(async ({ page }) => {
  await mockProfile(page, TRACKING)
})

/** The ranked grid — named, because the catalog below offers the same controls. */
const frequentSection = (page: Page) =>
  page.getByRole('region', { name: 'Frequent foods' })

test('ranks the frequent foods over the trailing 30 days, with an estimate as their peer', async ({
  page,
  goto,
}) => {
  const asked = await mockFrequentFoods(page, RANKED)
  await mockFoods(page, RANKED)

  await goto('/log', { waitUntil: 'hydration' })

  // External aria-snapshot, one baseline per project: the grid is the same at
  // both viewports, but the shell around it is not.
  await expect(page.getByRole('main')).toMatchAriaSnapshot()
  // The window is the client's (ADR 0014) and is the only one the backend
  // accepts — a different span would 400 rather than return a wider ranking.
  const today = localTodayIso()
  // Every request, not merely one of them: a second read on a different window
  // would be a different question answered into the same grid.
  expect(asked).toEqual([{ from: isoShiftDays(today, -29), to: today }])
})

test('fits all ten frequent foods on one screen without scrolling', async ({
  page,
  goto,
}) => {
  // The acceptance criterion the two-column grid exists for: ten full-width rows
  // scroll at a phone width, and ten cells do not (ADR 0028). Asserted on the
  // Mobile Chrome project's real 412px viewport, which the desktop project's
  // wider one passes trivially.
  //
  // Measured on the grid rather than on the document, because the catalog now
  // sits below it and is *meant* to scroll: what must not scroll is the ten.
  await mockFrequentFoods(page, TEN)
  await mockFoods(page, TEN)

  await goto('/log', { waitUntil: 'hydration' })

  const cells = frequentSection(page).getByRole('listitem')
  await expect(cells).toHaveCount(10)
  await expect(cells.last()).toBeInViewport({ ratio: 1 })

  // In the viewport is not the whole criterion: the phone's tab bar is painted
  // over the bottom of it, and `toBeInViewport` is geometric, so a tenth cell
  // underneath the bar passes while being unreadable and untappable.
  const last = (await cells.last().boundingBox())!
  const floor = await page.evaluate(() => {
    // `lg:hidden` leaves the bar in the DOM with a zero-sized rect, so the
    // desktop project has to read the height of the box, not its existence.
    const box = document
      .querySelector('[data-testid="bottom-nav"]')
      ?.getBoundingClientRect()
    return box && box.height > 0 ? box.top : window.innerHeight
  })
  expect(last.y + last.height).toBeLessThanOrEqual(floor)
})

test('logs a weighed entry for the food whose cell was tapped', async ({
  page,
  goto,
}) => {
  await mockFrequentFoods(page, RANKED)
  await mockFoods(page, RANKED)
  const logged = await mockWeighedEntryLog(page)

  await goto('/log', { waitUntil: 'hydration' })

  await frequentSection(page)
    .getByRole('button', { name: 'Log Rolled oats' })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Log Rolled oats' })
  await sheet.getByLabel(/weight \(g\)/i).click()
  await page.keyboard.type('80')
  // The number field commits its model on blur, so leave it before submitting.
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: /log entry/i }).click()

  await expect(sheet).toBeHidden()
  expect(logged).toEqual([{ date: localTodayIso(), foodId: 1, grams: 80 }])
})

test('finds a food the grid does not hold, and logs it the same way', async ({
  page,
  goto,
}) => {
  await mockFrequentFoods(page, RANKED)
  await mockFoods(page, [...RANKED, TUNA])
  const logged = await mockWeighedEntryLog(page, { foodName: 'Tinned tuna' })

  await goto('/log', { waitUntil: 'hydration' })
  await page.getByLabel('Filter foods').fill('tuna')

  // One flat list of matches: ten unrelated Frequent Foods above them would
  // answer a question the User has stopped asking (ADR 0028).
  await expect(frequentSection(page)).toBeHidden()
  const matches = page.getByRole('region', { name: 'Matching foods' })
  await expect(matches.getByRole('listitem')).toHaveCount(1)

  // The same grams sheet and the same Budget Projection gate as a picked cell.
  await matches.getByRole('button', { name: 'Log Tinned tuna' }).click()
  const sheet = page.getByRole('dialog', { name: 'Log Tinned tuna' })
  await sheet.getByLabel(/weight \(g\)/i).click()
  await page.keyboard.type('120')
  // The number field commits its model on blur, so leave it before submitting.
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: /log entry/i }).click()

  await expect(sheet).toBeHidden()
  expect(logged).toEqual([{ date: localTodayIso(), foodId: 4, grams: 120 }])
})

test('restores the grid and the whole catalog when the filter is cleared', async ({
  page,
  goto,
}) => {
  await mockFrequentFoods(page, RANKED)
  await mockFoods(page, [...RANKED, TUNA])

  await goto('/log', { waitUntil: 'hydration' })
  await page.getByLabel('Filter foods').fill('tuna')
  await expect(frequentSection(page)).toBeHidden()

  await page.getByRole('button', { name: 'Clear filter' }).click()

  await expect(frequentSection(page)).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'All foods' }).getByRole('listitem'),
  ).toHaveCount(4)
})

test('hands a User with no foods to the catalog with the Add sheet already open', async ({
  page,
  goto,
}) => {
  await mockFrequentFoods(page, [])
  await mockFoods(page, [])

  await goto('/log', { waitUntil: 'hydration' })
  await page.getByRole('link', { name: /add your first food/i }).click()

  await expect(page.getByRole('dialog', { name: /add/i })).toBeVisible()
})

test('offers a retry, not an empty grid, when the ranking cannot be read', async ({
  page,
  goto,
}) => {
  await mockFrequentFoodsError(page)
  await mockFoods(page, RANKED)

  await goto('/log', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: "Couldn't load your frequent foods" }),
  ).toBeVisible()
  // Not the empty-catalog dead end: this User has Foods, the read failed.
  await expect(
    page.getByRole('link', { name: /add your first food/i }),
  ).toBeHidden()
})
