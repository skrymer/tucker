import { expect, test } from './support/test'
import { goalInProgress, reachedGoal } from '../test/mocks/handlers/goal'
import { summaryOf } from '../test/mocks/handlers/summary'

// F7 slice 2 (ADR 0008): when the Trend Weight first crosses the Goal's target,
// the Goal is *reached* and /today shows an insistent two-way fork banner — no
// dismiss. "Switch to maintenance" deactivates the Goal (DELETE /api/goal); the
// backend force-recomputes today's review so the Budget lifts to Maintenance,
// and the page lands on the calm "Maintaining" card.

test('a reached goal with every reading deleted claims no trend, and waits on a weight before offering maintenance', async ({
  page,
  goto,
  network,
}) => {
  // The backend's Goal Progress with no reading: the plan figures are null,
  // and the latch stays set. The summary still holds the last review's Budget.
  network.use(
    goalInProgress({
      reachedOn: '2026-06-05',
      currentTrendKg: null,
      kgToGo: null,
      percentComplete: null,
      plannedFinishDate: null,
    }),
    summaryOf({
      caloriesConsumed: 0,
      proteinConsumed: 0,
      estimatedCalorieShare: 0,
      setupComplete: false,
      calorieBudget: 1983,
      proteinFloor: 177,
      caloriesRemaining: 1983,
      dayStatus: 'in-progress',
      trendWeightKg: 88.4,
      entries: [],
      budgetChange: null,
    }),
  )

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: /you reached your goal/i }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'You reached your target of 80.0 kg. Log a weight to see where you stand on your Goal.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(page.getByText(/your trend weight has reached/i)).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /switch to maintenance/i }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: /set a lower goal/i }),
  ).toHaveAttribute('href', '/profile')
})

test('reaching a goal shows the fork banner, and switching to maintenance lands on the Maintaining card', async ({
  page,
  goto,
  network,
}) => {
  const goal = reachedGoal('2026-06-05')
  // Budget lifts from the cut (2000) to Maintenance (2400) once switched.
  network.use(
    ...goal.handlers,
    summaryOf(() => ({
      caloriesConsumed: 1200,
      proteinConsumed: 90,
      estimatedCalorieShare: 0,
      setupComplete: true,
      calorieBudget: goal.isActive() ? 2000 : 2400,
      proteinFloor: 160,
      caloriesRemaining: goal.isActive() ? 800 : 1200,
      dayStatus: 'in-progress',
      trendWeightKg: 79.9,
      entries: [],
      budgetChange: null,
    })),
  )

  await goto('/', { waitUntil: 'hydration' })

  // The insistent fork: a celebratory heading and exactly the two resolving
  // actions — and crucially no dismiss/close affordance.
  await expect(
    page.getByRole('heading', { name: /you reached your goal/i }),
  ).toBeVisible()
  const switchToMaintenance = page.getByRole('button', {
    name: /switch to maintenance/i,
  })
  await expect(switchToMaintenance).toBeVisible()
  await expect(
    page.getByRole('link', { name: /set a lower goal/i }),
  ).toHaveAttribute('href', '/profile')

  // The banner carries the milestone, so the 100% Goal-Progress tile is
  // suppressed while reached — only the fork shows.
  await expect(page.getByText('Goal progress')).toHaveCount(0)

  // The cut Budget is still in force before the user resolves the fork.
  await expect(page.getByText('1200 / 2000 kcal')).toBeVisible()

  await switchToMaintenance.click()

  // Lands on the calm Maintaining card; the Budget has lifted to Maintenance.
  await expect(
    page.getByRole('heading', { name: 'Maintaining', level: 2 }),
  ).toBeVisible()
  await expect(page.getByText('1200 / 2400 kcal')).toBeVisible()

  // The fork is resolved — the reached banner is gone.
  await expect(
    page.getByRole('heading', { name: /you reached your goal/i }),
  ).toHaveCount(0)
})
