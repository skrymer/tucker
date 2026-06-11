import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// Earned day-status smoke (issue #104): the verdict on /today against the real
// backend. DaySummary shows a verdict only once it's earned — nothing for a
// fresh in-progress day, green "On target" once the Protein Floor is met within
// the Calorie Budget, and red "Over budget" the moment intake passes the Budget
// (which wins even with the Floor still met). No /api mocks: we complete setup
// to get a Budget + Floor, read them, then log Estimated entries through the API
// to drive the day through all three states. The per-test reset (smoke-test.ts)
// wipes the seeded review + entries afterwards, so no cleanup is needed.
const API = 'http://localhost:8080/api'

test('the day verdict goes from none to on target to over budget as entries land', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // Complete setup the way a real install does — profile, a weight reading, then
  // an active goal, which fires the first Weekly Review and so yields a Calorie
  // Budget and Protein Floor to judge the day against.
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

  // Read the Budget and Floor the review produced so the entries below are sized
  // relative to them, not to hard-coded numbers.
  const summary = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  const budget = summary.calorieBudget as number
  const floor = summary.proteinFloor as number
  expect(budget).toBeGreaterThan(0)

  // A fresh day with no entries is in progress — it has earned no verdict.
  await goto('/', { waitUntil: 'hydration' })
  await expect(
    page.getByRole('heading', { name: 'Calories', level: 2 }),
  ).toBeVisible()
  await expect(page.getByText('On target')).toHaveCount(0)
  await expect(page.getByText('Over budget')).toHaveCount(0)

  // Log an Estimated entry that meets the Floor while staying well under Budget —
  // the day is now on target.
  const onTargetEntry = await request.post(`${API}/entries/estimated`, {
    data: {
      date: today,
      label: 'on-target meal',
      calories: Math.round(budget * 0.5),
      protein: Math.ceil(floor) + 5,
    },
  })
  expect(onTargetEntry.ok()).toBe(true)

  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText('On target')).toBeVisible()
  await expect(page.getByText('Over budget')).toHaveCount(0)

  // Log another Estimated entry that pushes intake past the Budget — over budget
  // wins outright, even though the Floor is still met.
  const overBudgetEntry = await request.post(`${API}/entries/estimated`, {
    data: {
      date: today,
      label: 'over-budget snack',
      calories: Math.round(budget * 0.7),
      protein: 0,
    },
  })
  expect(overBudgetEntry.ok()).toBe(true)

  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText('Over budget')).toBeVisible()
  await expect(page.getByText('On target')).toHaveCount(0)
})
