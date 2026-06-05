import { test, expect } from '@nuxt/test-utils/playwright'

// F7 slice 1 smoke: Maintenance Mode on /today, end-to-end against the real
// backend. No /api mocks. With no active Goal the backend budgets the weekly
// review at Maintenance (no deficit) and the dashboard replaces the Goal-Progress
// card with the calm "Maintaining" card showing the Trend Weight, while the daily
// summary still renders the Budget and Floor.
//
// The shared volume may already hold an active Goal from an earlier goal-smoke,
// so we switch to maintenance via DELETE /api/goal (which also force-recomputes
// today's review), and restore the prior Goal and weight on the way out.

const API = 'http://localhost:8080/api'

type WeightRecord = { id: number; measuredOn: string; weightKg: number }

test('with no active Goal the Today page shows the Maintaining card and a Maintenance budget', async ({
  page,
  goto,
  request,
}) => {
  const today = new Date().toLocaleDateString('en-CA')

  // Maintenance Mode needs a profile and at least one weight reading.
  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  const origToday = await todayWeight(request, today)
  await postWeight(request, today, 84.0)

  // Snapshot any active Goal so we can put it back, then switch to maintenance.
  const goalRes = await request.get(`${API}/goal`)
  const priorGoal = goalRes.ok() ? await goalRes.json() : null
  const del = await request.delete(`${API}/goal`)
  expect(del.status()).toBe(204)

  // No active Goal now: the goal endpoint 404s and the summary budgets at
  // Maintenance — what the backend computes is what the dashboard must render.
  expect((await request.get(`${API}/goal`)).status()).toBe(404)
  const summary = await (
    await request.get(`${API}/summary?date=${today}`)
  ).json()
  expect(summary.calorieBudget).toBeGreaterThan(0)
  expect(summary.trendWeightKg).toBeGreaterThan(0)

  const trendText = `${summary.trendWeightKg.toFixed(1)} kg`
  const budgetText = `/ ${Math.round(summary.calorieBudget)} kcal`

  await goto('/', { waitUntil: 'hydration' })

  // The Maintaining card replaces Goal-Progress: a calm heading and the Trend Weight.
  const card = page
    .locator('[data-slot="root"]')
    .filter({ hasText: 'Maintaining' })
  await expect(
    card.getByRole('heading', { name: 'Maintaining', level: 2 }),
  ).toBeVisible()
  await expect(card.getByText(trendText)).toBeVisible()

  // Budget still renders in the daily summary.
  await expect(page.getByText(budgetText, { exact: false })).toBeVisible()

  // The Goal-Progress card is gone.
  await expect(
    page.getByRole('link', { name: /goal progress|set a goal/i }),
  ).toHaveCount(0)

  // Restore: recreate the prior active Goal (if any) and put back the today weight.
  if (priorGoal) {
    const restore = await request.post(`${API}/goal`, {
      data: {
        startedOn: priorGoal.startedOn,
        startWeightKg: priorGoal.startWeightKg,
        targetWeightKg: priorGoal.targetWeightKg,
        rateKgPerWeek: priorGoal.rateKgPerWeek,
      },
    })
    expect(restore.status()).toBe(201)
  }
  if (origToday) await postWeight(request, today, origToday.weightKg)
  else await deleteWeightOn(request, today)
})

async function todayWeight(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  date: string,
): Promise<WeightRecord | null> {
  const list = await request.get(`${API}/weight`)
  expect(list.ok()).toBe(true)
  const records = (await list.json()) as WeightRecord[]
  return records.find((r) => r.measuredOn === date) ?? null
}

async function postWeight(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  date: string,
  weightKg: number,
) {
  const res = await request.post(`${API}/weight`, {
    data: { date, weightKg, clientToday: date },
  })
  expect(res.ok()).toBe(true)
}

async function deleteWeightOn(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  date: string,
) {
  const record = await todayWeight(request, date)
  if (record) {
    const del = await request.delete(`${API}/weight/${record.id}`)
    expect(del.status()).toBe(204)
  }
}
