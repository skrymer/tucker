import { estimatedEntry, weighedEntry } from '../test/entry-fixtures'
import { goalProgress } from '../test/goal-fixtures'
import { expect, test } from './support/test'
import {
  mockGoalProgress,
  mockNoActiveGoal,
  mockSummary,
  mockSummaryError,
  mockWeightApi,
} from './support/mock-api'

/** An on-target day with one Entry on it — the resting shape Today renders. */
const DAY_WITH_AN_ENTRY = {
  date: '2026-05-22',
  caloriesConsumed: 1500,
  proteinConsumed: 140,
  estimatedCalorieShare: 0,
  setupComplete: true,
  calorieBudget: 2000,
  proteinFloor: 140,
  caloriesRemaining: 500,
  dayStatus: 'on-target',
  entries: [
    weighedEntry({
      id: 1,
      calories: 240,
      protein: 8,
      foodId: 3,
      foodName: 'Oats',
      grams: 60,
    }),
  ],
}

test('the Today page shows the daily summary from the API', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockNoActiveGoal(page)
  await mockSummary(page, DAY_WITH_AN_ENTRY)

  await goto('/', { waitUntil: 'hydration' })

  // A closed-world baseline of the whole resting page, which is what carries
  // "Today never logs an Entry": no header button, and no phone FAB either.
  // Playwright keeps one baseline per project (Desktop / Mobile Chrome), and
  // with the FAB gone the two now read alike.
  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})

test("logging a weight from the tile shows it as today's weight", async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockNoActiveGoal(page)
  await mockSummary(page)

  await goto('/', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Log weight' }).click()
  await page.getByLabel(/weight \(kg\)/i).fill('84.2')
  await page
    .getByRole('dialog', { name: /log weight/i })
    .getByRole('button', { name: /save weight/i })
    .click()

  // The tile flips into logged-today state with the value and an edit affordance.
  await expect(page.getByText('84.2 kg')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /edit today's weight/i }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log weight' })).toHaveCount(0)
})

test('the weight sheet stays put, reporting busy, until the save lands', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockNoActiveGoal(page)
  await mockSummary(page)

  // Hold the POST open so the in-flight window is observable. Registered after
  // mockWeightApi so it runs first, then hands the request back to it.
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/weight', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await held
    return route.fallback()
  })

  await goto('/', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Log weight' }).click()
  await page.getByLabel(/weight \(kg\)/i).fill('84.2')
  const sheet = page.getByRole('dialog', { name: /log weight/i })
  const save = sheet.getByRole('button', { name: /save weight/i })
  await save.click()

  await expect(save).toBeDisabled()

  // The sheet is the confirmation, so nothing may take it away mid-save: losing
  // it here would leave no sheet, no spinner and no way to tell whether the
  // reading landed. ResponsiveOverlay is non-dismissible unless a sheet asks
  // for it (UModal's `dismissible` is Boolean-cast, so absent reads as false),
  // and this pins that the weight sheet never does. Read `data-state`, not
  // visibility: a dismissed Reka dialog stays mounted and visible for its exit
  // animation, so `toBeVisible()` would pass on the first poll either way.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveAttribute('data-state', 'open')

  release()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('84.2 kg')).toBeVisible()
})

test("shows a retryable error instead of an empty dashboard when today's summary fails to load", async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockNoActiveGoal(page)
  await mockSummaryError(page)

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: "Couldn't load today's summary" }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('the day ring and the goal ring are peers at the same size', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockSummary(page, {
    date: '2026-05-22',
    caloriesConsumed: 1500,
    proteinConsumed: 140,
    estimatedCalorieShare: 0,
    setupComplete: true,
    calorieBudget: 2000,
    proteinFloor: 140,
    caloriesRemaining: 500,
    dayStatus: 'on-target',
    trendWeightKg: 86,
    entries: [],
  })
  await mockGoalProgress(page, goalProgress())

  await goto('/', { waitUntil: 'hydration' })

  // Both centres render — the day's remaining calories and the goal's kg to go.
  await expect(page.getByText('500', { exact: true })).toBeVisible()
  await expect(page.getByText('6.0', { exact: true })).toBeVisible()

  // DESIGN.md's two-ring rule is a rule about size, so it is checked as one:
  // sizing either down would rank weight against calories. The rings are
  // decorative SVG with no role of their own, hence the geometry locator.
  const rings = page.getByRole('main').locator('svg[viewBox="0 0 176 176"]')
  await expect(rings).toHaveCount(2)
  const day = (await rings.nth(0).boundingBox())!
  const goal = (await rings.nth(1).boundingBox())!
  expect(goal.width).toBe(day.width)
  expect(goal.height).toBe(day.height)

  // And they stack rather than collide, at whichever viewport this project runs.
  expect(goal.y).toBeGreaterThanOrEqual(day.y + day.height)
})

test('a name long enough to clip never squeezes the flag beside it', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockNoActiveGoal(page)
  await mockSummary(page, {
    ...DAY_WITH_AN_ENTRY,
    entries: [
      estimatedEntry({ id: 1, calories: 240, protein: 8, label: 'Toast' }),
      estimatedEntry({
        id: 2,
        calories: 240,
        protein: 8,
        // Longer than any phone column, so the name must clip rather than push
        // the flag off the row.
        label: 'RECONSTITUTED LONG LIFE FULL CREAM DAIRY MILK BEVERAGE',
      }),
    ],
  })

  await goto('/', { waitUntil: 'hydration' })

  const rows = page.getByRole('main').getByRole('listitem')
  const shortFlag = rows.filter({ hasText: 'Toast' }).getByText('est.')
  const longFlag = rows
    .filter({ hasText: 'Reconstituted long life' })
    .getByText('est.')

  // The marker qualifies the name, so it has to survive beside one of any
  // length — it is `shrink-0` for this reason, and without it the flex line
  // takes the width back from the badge rather than from the name.
  await expect(longFlag).toBeVisible()
  const short = await shortFlag.boundingBox()
  const long = await longFlag.boundingBox()
  expect(long!.width).toBeCloseTo(short!.width, 0)
})
