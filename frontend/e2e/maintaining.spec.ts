import { expect, test } from './support/test'
import { summaryOf } from '../test/mocks/handlers/summary'

// Maintenance Mode (ADR 0008, F7 slice 1): no active Goal (goal endpoints 404)
// but a weekly review has produced a Budget and Trend Weight. The Today page
// replaces the Goal-Progress card with the calm "Maintaining" card; Budget and
// Floor still render in the daily summary as normal. The baseline has no Goal.
test('the Today page shows the Maintaining card in place of Goal-Progress when there is no active Goal', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    summaryOf({
      caloriesConsumed: 1200,
      proteinConsumed: 90,
      estimatedCalorieShare: 0,
      setupComplete: true,
      calorieBudget: 2400,
      proteinFloor: 172,
      caloriesRemaining: 1200,
      dayStatus: 'in-progress',
      trendWeightKg: 85.8,
      entries: [],
      budgetChange: null,
      driftStatus: 'holding',
      observedRateKgPerWeek: 0.02,
    }),
  )

  await goto('/', { waitUntil: 'hydration' })

  // The Goal card, maintaining: the Trend Weight and the Drift Status.
  const goal = page.getByRole('region', { name: 'Goal' })
  await expect(goal.getByText("You're maintaining")).toBeVisible()
  await expect(goal.getByText('85.8 kg')).toBeVisible()
  await expect(goal.getByText('Holding', { exact: true })).toBeVisible()

  // Budget and Floor still render in the daily summary as normal.
  await expect(page.getByText('1200 / 2400 kcal')).toBeVisible()
  await expect(page.getByText('90 / 172 g')).toBeVisible()

  // The Goal-Progress card is gone — no "Goal progress" tile, no "Set a goal" CTA.
  await expect(
    page.getByRole('link', { name: /goal progress|set a goal/i }),
  ).toHaveCount(0)
})
