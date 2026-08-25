import { weighedEntry } from '../test/entry-fixtures'
import { goalProgress } from '../test/goal-fixtures'
import { expect, test } from './support/test'
import {
  mockGoalProgress,
  mockNoActiveGoal,
  mockSummary,
  mockSummaryError,
  mockWeightApi,
} from './support/mock-api'

test('the Today page shows the daily summary from the API', async ({
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
  })

  await goto('/', { waitUntil: 'hydration' })

  // The Log-entry action is always reachable without scrolling — a header button
  // on desktop, a floating button on phone — so the resting tree differs by
  // viewport; one closed-world baseline per project (the Desktop/Mobile split).
  await expect(page.getByRole('button', { name: 'Log entry' })).toBeVisible()
  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})

test('the always-visible action opens the log-entry sheet', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
  await mockSummary(page)

  await goto('/', { waitUntil: 'hydration' })

  // The page owns the trigger now — a header button on desktop, a FAB on phone,
  // both named "Log entry" — so this one assertion guards both viewports' wiring
  // through to the controlled sheet (the fast-suite guard the smokes also cover).
  await page.getByRole('button', { name: 'Log entry' }).click()

  const sheet = page.getByRole('dialog', { name: /log entry/i })
  await expect(sheet).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Estimated' })).toBeVisible()
  await expect(sheet.getByLabel('Label')).toBeVisible()
})

test("logging a weight from the tile shows it as today's weight", async ({
  page,
  goto,
}) => {
  await mockWeightApi(page)
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
