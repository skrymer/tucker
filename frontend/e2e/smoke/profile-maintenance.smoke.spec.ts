import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F7 slice 5 smoke: the durable Maintenance Mode status on /profile, end-to-end
// against the real backend. No /api mocks. With no active Goal the Goal section
// shows the persistent "You're maintaining" status and a "Start a goal" CTA that
// re-enters the Goal-creation flow (the same destination as the reached banner's
// "Set a lower goal").
//
// The shared volume may already hold an active Goal from an earlier goal-smoke,
// so we snapshot it, switch to maintenance via DELETE /api/goal, and restore the
// prior Goal and weight on the way out.

const API = 'http://localhost:8080/api'

type WeightRecord = { id: number; measuredOn: string; weightKg: number }

test('with no active Goal the Profile page shows the maintenance status and a "Start a goal" CTA that opens goal creation', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // The Goal section unlocks only once a profile and a weight reading exist.
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
  expect((await request.get(`${API}/goal`)).status()).toBe(404)

  await goto('/profile', { waitUntil: 'hydration' })

  // The durable maintenance status and its re-entry CTA are both present.
  const goal = page.getByRole('region', { name: /^goal$/i })
  await expect(goal.getByText(/maintaining/i)).toBeVisible()
  const startGoal = goal.getByRole('button', { name: /start a goal/i })
  await expect(startGoal).toBeVisible()

  // The Goal form stays behind the CTA until the user chooses to re-enter.
  await expect(goal.getByLabel(/target weight/i)).toHaveCount(0)

  // Tapping the CTA opens the Goal-creation flow.
  await startGoal.click()
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
  await expect(goal.getByRole('button', { name: /^set goal$/i })).toBeVisible()

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
