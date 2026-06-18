import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// Budget Projection smoke (issue #120): the confirm-to-proceed gate extends to
// Estimated Entries. With a Calorie Budget in place and most of the day already
// eaten, an estimated entry whose calories would tip the day over budget is NOT
// logged on the first Save — the sheet shows an over-budget warning and the action
// becomes "Log anyway". A second deliberate tap logs it, and the dashboard flips to
// "Over budget". The per-test reset (smoke-test.ts) wipes the seeded review and entries.
const API = 'http://localhost:8080/api'

test('an estimated entry over budget warns first, then logs on "Log anyway"', async ({
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

  // Eat ~80% of the budget up front, so a modest estimate tips the day over.
  await request.post(`${API}/entries/estimated`, {
    data: {
      date: today,
      label: 'most of the day',
      calories: Math.round(budget * 0.8),
      protein: 0,
    },
  })

  // An estimate worth ~50% of the budget, so the projected total (~130%) is clearly over.
  const estimate = Math.ceil(budget * 0.5)

  await goto('/', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: /log entry/i }).click()
  const sheet = page.getByRole('dialog', { name: /log entry/i })
  await expect(sheet).toBeVisible()
  // Estimated is the default tab — log the calories directly, no food picker.

  await sheet.getByLabel('Label').fill('Dinner out')
  await sheet.getByLabel('Calories').click()
  await page.keyboard.type(String(estimate))

  // First Save → the projection warns; nothing is logged yet, the sheet stays open.
  await sheet.getByRole('button', { name: /log estimated entry/i }).click()
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText(/over your .* budget/i)).toBeVisible()
  const logAnyway = sheet.getByRole('button', { name: /log anyway/i })
  await expect(logAnyway).toBeVisible()
  await expect(
    sheet.getByRole('button', { name: /log estimated entry/i }),
  ).toBeHidden()

  // Second deliberate tap → logs anyway; the day is now over budget.
  await logAnyway.click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Over budget')).toBeVisible()
})
