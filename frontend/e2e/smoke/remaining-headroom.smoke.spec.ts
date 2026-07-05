import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// Day Ring smoke: the calorie centre on /today against the real backend — it
// counts down "kcal left" as Estimated entries are logged, then flips to
// "kcal over" once the Budget is breached. No /api mocks: complete setup to earn
// a Budget, read it, then log entries through the API to move the day between
// states. The per-test reset (smoke-test.ts) wipes the seeded review + entries.
const API = 'http://localhost:8080/api'

test('the Day Ring centre counts calories left, then flips to over budget', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // Complete setup the way a real install does — profile, a weight reading, then
  // an active goal, which fires the first Weekly Review and yields a Calorie
  // Budget to count down from.
  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  await request.post(`${API}/weight`, { data: { date: today, weightKg: 85 } })
  const goal = await request.post(`${API}/goal`, {
    data: {
      startedOn: today,
      startWeightKg: 85,
      targetWeightKg: 80,
      rateKgPerWeek: 0.5,
    },
  })
  expect(goal.status()).toBe(201)

  // Read the Budget the review produced, so the assertions ride on real engine
  // numbers rather than hard-coded ones.
  const summary = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  const budget = summary.calorieBudget as number
  expect(budget).toBeGreaterThan(0)

  // Log a partial meal under budget — the ring counts down; the centre reads
  // "kcal left" and the legend reflects the consumed calories.
  const partialCalories = Math.round(budget * 0.4)
  const partial = await request.post(`${API}/entries/estimated`, {
    data: {
      date: today,
      label: 'partial meal',
      calories: partialCalories,
      protein: 20,
    },
  })
  expect(partial.ok()).toBe(true)

  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText('kcal left')).toBeVisible()
  await expect(
    page.getByText(`${partialCalories} / ${Math.round(budget)} kcal`),
  ).toBeVisible()
  await expect(page.getByText('kcal over')).toHaveCount(0)

  // Log a large entry that breaches the Budget — the centre flips to "kcal over".
  const over = await request.post(`${API}/entries/estimated`, {
    data: {
      date: today,
      label: 'over budget',
      calories: Math.round(budget),
      protein: 20,
    },
  })
  expect(over.ok()).toBe(true)

  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText('kcal over')).toBeVisible()
  await expect(page.getByText('kcal left')).toHaveCount(0)
})
