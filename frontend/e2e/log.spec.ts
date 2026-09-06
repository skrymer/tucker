import { expect, test } from './support/test'
import {
  mockFoods,
  mockFrequentFoods,
  mockFrequentFoodsError,
  mockProfile,
} from './support/mock-api'
import { food, recipe } from '../test/food-fixtures'
import { isoShiftDays, todayIso } from './support/date'

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
  const today = todayIso()
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
  await mockFrequentFoods(page, TEN)
  await mockFoods(page, TEN)

  await goto('/log', { waitUntil: 'hydration' })

  await expect(page.getByRole('listitem')).toHaveCount(10)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true)
})

test('logs a weighed entry for the food whose cell was tapped', async ({
  page,
  goto,
}) => {
  await mockFrequentFoods(page, RANKED)
  await mockFoods(page, RANKED)
  await page.route('**/api/entries/weighed/preview', (route) =>
    route.fulfill({
      json: { wouldExceedBudget: false, calorieBudget: 1900, overByKcal: null },
    }),
  )
  const logged: unknown[] = []
  await page.route('**/api/entries/weighed', (route) => {
    logged.push(route.request().postDataJSON())
    return route.fulfill({
      status: 201,
      json: { id: 9, kind: 'WEIGHED', label: 'Rolled oats', calories: 303 },
    })
  })

  await goto('/log', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Log Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Log Rolled oats' })
  await sheet.getByLabel(/weight \(g\)/i).click()
  await page.keyboard.type('80')
  // The number field commits its model on blur, so leave it before submitting.
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: /log entry/i }).click()

  await expect(sheet).toBeHidden()
  expect(logged).toEqual([{ date: todayIso(), foodId: 1, grams: 80 }])
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
