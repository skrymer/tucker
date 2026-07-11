import { expect, test } from './support/test'
import {
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
    calorieBudget: 2000,
    proteinFloor: 140,
    caloriesRemaining: 500,
    dayStatus: 'on-target',
    entries: [
      {
        id: 1,
        loggedOn: '2026-05-22',
        kind: 'WEIGHED',
        calories: 240,
        isEstimate: false,
        foodId: 3,
        foodName: 'Oats',
        grams: 60,
      },
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
