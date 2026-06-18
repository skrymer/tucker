import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// Budget Projection smoke (issue #119): the confirm-to-proceed gate over the real
// backend. With a Calorie Budget in place and most of the day already eaten, a
// weighed entry that would tip the day over budget is NOT logged on the first Save
// — the sheet shows an over-budget warning and the action becomes "Log anyway".
// A second deliberate tap logs it, and the dashboard flips to "Over budget".
// The per-test reset (smoke-test.ts) wipes the seeded review, food, and entries.
const API = 'http://localhost:8080/api'

test('a weighed entry over budget warns first, then logs on "Log anyway"', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // Complete setup → the first Weekly Review yields a Calorie Budget to judge against.
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

  const summary = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  const budget = summary.calorieBudget as number
  expect(budget).toBeGreaterThan(0)

  // Eat ~80% of the budget up front, so a modest weighed entry tips the day over.
  await request.post(`${API}/entries/estimated`, {
    data: {
      date: today,
      label: 'most of the day',
      calories: Math.round(budget * 0.8),
      protein: 0,
    },
  })

  // A food at 400 kcal/100g (0P + 100C + 0F → 4 × 100). Grams sized to add ~50%
  // of the budget, so the projected total (~130%) is clearly over.
  const foodName = `Budget smoke ${Date.now()}`
  const created = await request.post(`${API}/foods`, {
    data: {
      name: foodName,
      proteinPer100g: 0,
      carbsPer100g: 100,
      fatPer100g: 0,
    },
  })
  expect(created.status()).toBe(201)
  const grams = Math.ceil((budget * 0.5) / 4)

  await goto('/', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: /log entry/i }).click()
  const sheet = page.getByRole('dialog', { name: /log entry/i })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('tab', { name: 'Weighed' }).click()

  await sheet.getByRole('button', { name: 'Show popup' }).click()
  await page.getByRole('option', { name: foodName }).click()
  await expect(sheet.getByText(foodName)).toBeVisible()

  await sheet.getByLabel('Grams').click()
  await page.keyboard.type(String(grams))

  // First Save → the projection warns; nothing is logged yet, the sheet stays open.
  await sheet.getByRole('button', { name: /log weighed entry/i }).click()
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText(/over your .* budget/i)).toBeVisible()
  const logAnyway = sheet.getByRole('button', { name: /log anyway/i })
  await expect(logAnyway).toBeVisible()
  await expect(
    sheet.getByRole('button', { name: /log weighed entry/i }),
  ).toBeHidden()

  // Second deliberate tap → logs anyway; the day is now over budget.
  await logAnyway.click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Over budget')).toBeVisible()
})
