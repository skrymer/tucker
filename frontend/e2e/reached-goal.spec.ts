import { expect, test } from './support/test'
import type { Page } from '@playwright/test'
import { mockWeightApi } from './support/mock-api'

// F7 slice 2 (ADR 0008): when the Trend Weight first crosses the Goal's target,
// the Goal is *reached* and /today shows an insistent two-way fork banner — no
// dismiss. "Switch to maintenance" deactivates the Goal (DELETE /api/goal); the
// backend force-recomputes today's review so the Budget lifts to Maintenance,
// and the page lands on the calm "Maintaining" card.

/** A reached active Goal until the user switches; 404 (maintenance) afterwards. */
async function mockReachedThenMaintenance(page: Page) {
  let maintaining = false

  await page.route('**/api/goal/progress', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    if (maintaining) {
      return route.fulfill({ status: 404, json: { message: 'no active Goal' } })
    }
    return route.fulfill({
      json: {
        startWeightKg: 90,
        targetWeightKg: 80,
        currentTrendKg: 79.9,
        kgToGo: 0,
        percentComplete: 100,
        plannedFinishDate: '2026-06-05',
        plannedRateKgPerWeek: 0.5,
        paceStatus: null,
        observedRateKgPerWeek: null,
        observedFinishDate: null,
        reachedOn: '2026-06-05',
      },
    })
  })

  // Matches /api/goal with or without a query string (the switch-to-maintenance
  // DELETE now carries ?clientToday=… per ADR 0014), but not /api/goal/progress
  // or /api/goals.
  await page.route(/\/api\/goal(\?.*)?$/, (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    maintaining = true
    return route.fulfill({ status: 204, body: '' })
  })

  // Budget lifts from the cut (2000) to Maintenance (2400) once switched.
  await page.route('**/api/summary**', (route) =>
    route.fulfill({
      json: {
        date: '2026-06-05',
        caloriesConsumed: 1200,
        proteinConsumed: 90,
        estimatedCalorieShare: 0,
        calorieBudget: maintaining ? 2400 : 2000,
        proteinFloor: 160,
        caloriesRemaining: maintaining ? 1200 : 800,
        dayStatus: 'in-progress',
        trendWeightKg: 79.9,
        entries: [],
        budgetChange: null,
      },
    }),
  )
}

test('reaching a goal shows the fork banner, and switching to maintenance lands on the Maintaining card', async ({
  page,
  goto,
}) => {
  await mockWeightApi(page, { id: 1, measuredOn: '2026-06-05', weightKg: 79.9 })
  await mockReachedThenMaintenance(page)

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
