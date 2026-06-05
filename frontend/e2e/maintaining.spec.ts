import { expect, test } from '@nuxt/test-utils/playwright'
import {
  mockNoActiveGoal,
  mockSummary,
  mockWeightApi,
} from './support/mock-api'

// Maintenance Mode (ADR 0008, F7 slice 1): no active Goal (goal endpoints 404)
// but a weekly review has produced a Budget and Trend Weight. The Today page
// replaces the Goal-Progress card with the calm "Maintaining" card; Budget and
// Floor still render in the daily summary as normal.
test('the Today page shows the Maintaining card in place of Goal-Progress when there is no active Goal', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page, { id: 1, measuredOn: '2026-06-05', weightKg: 85.6 })
  await mockNoActiveGoal(page)
  await mockSummary(page, {
    date: '2026-06-05',
    caloriesConsumed: 1200,
    proteinConsumed: 90,
    estimatedCalorieShare: 0,
    calorieBudget: 2400,
    proteinFloor: 172,
    caloriesRemaining: 1200,
    onTarget: true,
    trendWeightKg: 85.8,
    entries: [],
    budgetChange: null,
  })

  await goto('/', { waitUntil: 'hydration' })

  // The Maintaining card: a calm heading and the current Trend Weight.
  await expect(
    page.getByRole('heading', { name: 'Maintaining', level: 2 }),
  ).toBeVisible()
  await expect(page.getByText('85.8 kg')).toBeVisible()

  // Budget and Floor still render in the daily summary as normal.
  await expect(page.getByText('1200 / 2400 kcal')).toBeVisible()
  await expect(page.getByText('90 / 172 g protein')).toBeVisible()

  // The Goal-Progress card is gone — no "Goal progress" tile, no "Set a goal" CTA.
  await expect(
    page.getByRole('link', { name: /goal progress|set a goal/i }),
  ).toHaveCount(0)
})
