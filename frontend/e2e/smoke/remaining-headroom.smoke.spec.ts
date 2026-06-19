import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// Remaining-figure smoke (issue #133): the "kcal left" / "g to go" / "floor met"
// readouts on /today against the real backend. proteinRemaining is a new backend
// field, so this proves it round-trips from SQLite through the summary into the
// card. No /api mocks: we complete setup to earn a Budget + Floor, read them, then
// log Estimated entries through the API to move the day through the readout
// states. The per-test reset (smoke-test.ts) wipes the seeded review + entries.
const API = 'http://localhost:8080/api'

test('the daily-summary card counts down calories left and protein to go, then reports the floor met', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // Complete setup the way a real install does — profile, a weight reading, then
  // an active goal, which fires the first Weekly Review and yields a Calorie
  // Budget and Protein Floor to count down from.
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

  // Read the Budget and Floor the review produced, so the expected readouts are
  // derived from real engine numbers rather than hard-coded.
  const summary = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  const budget = summary.calorieBudget as number
  const floor = summary.proteinFloor as number
  expect(budget).toBeGreaterThan(0)
  expect(floor).toBeGreaterThan(0)

  // Log a partial meal — under budget, under the floor — so both readouts count
  // down rather than report met/over.
  const calories = Math.round(budget * 0.4)
  const protein = Math.floor(floor * 0.5)
  const partial = await request.post(`${API}/entries/estimated`, {
    data: { date: today, label: 'partial meal', calories, protein },
  })
  expect(partial.ok()).toBe(true)

  // The exact protein readout — matched precisely, since a loose /g to go/ would
  // also catch the Goal-progress card's "kg to go".
  const proteinToGo = `${Math.round(floor - protein)} g to go`

  await goto('/', { waitUntil: 'hydration' })
  await expect(
    page.getByText(`${Math.round(budget - calories)} kcal left`),
  ).toBeVisible()
  await expect(page.getByText(proteinToGo, { exact: true })).toBeVisible()
  await expect(page.getByText('floor met')).toHaveCount(0)

  // Top up the protein past the floor without breaching the budget — the protein
  // readout flips to "floor met", the calorie readout still counts down.
  const topUp = await request.post(`${API}/entries/estimated`, {
    data: { date: today, label: 'protein top-up', calories: 1, protein: floor },
  })
  expect(topUp.ok()).toBe(true)

  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText('floor met')).toBeVisible()
  await expect(page.getByText(proteinToGo, { exact: true })).toHaveCount(0)
  await expect(page.getByText(/kcal left/)).toBeVisible()
})
