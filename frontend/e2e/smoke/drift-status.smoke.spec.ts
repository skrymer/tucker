import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F7 slice 3 smoke: Drift Status on /today in Maintenance Mode, end-to-end
// against the real backend. No /api mocks. With no active Goal the backend
// classifies the Trend Weight's trailing slope against a zero rate and folds the
// result into the summary; the Maintaining card shows it as a calm Drift Status.
//
// We seed a steadily *rising* 28-day trend so drift reads "drifting up", assert
// the dashboard renders what GET /api/summary computes, then restore the weights
// and any prior Goal — the shared volume persists between runs.

const API = 'http://localhost:8080/api'

type WeightRecord = { id: number; measuredOn: string; weightKg: number }
type Request = Parameters<Parameters<typeof test>[1]>[0]['request']

/** An ISO `yyyy-mm-dd` date shifted by whole days, in UTC to dodge DST. */
function isoPlusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

test('the Maintaining card shows a Drifting up status when the trend is rising', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // Maintenance Mode needs a profile. Snapshot any active Goal, then switch to
  // maintenance via DELETE /api/goal (which also force-recomputes today's review).
  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  const goalRes = await request.get(`${API}/goal`)
  const priorGoal = goalRes.ok() ? await goalRes.json() : null
  const del = await request.delete(`${API}/goal`)
  expect(del.status()).toBe(204)
  expect((await request.get(`${API}/goal`)).status()).toBe(404)

  // A month of steadily rising weight: the trend drifts up past the ±0.1 band.
  const window = 28
  const fromKg = 84.0
  const toKg = 86.0
  const seeded: Array<{ date: string; weightKg: number }> = []
  for (let day = 0; day <= window; day++) {
    seeded.push({
      date: isoPlusDays(today, day - window),
      weightKg: Number((fromKg + ((toKg - fromKg) * day) / window).toFixed(1)),
    })
  }

  // Snapshot the readings on the dates we overwrite, to restore them after.
  const before = await weightList(request)
  const seededDates = new Set(seeded.map((s) => s.date))
  const originalIds = new Set(before.map((r) => r.id))
  for (const { date, weightKg } of seeded) {
    await postWeight(request, date, weightKg, today)
  }

  // What the backend computes is what the dashboard must render.
  const summary = await (
    await request.get(`${API}/summary?date=${today}`)
  ).json()
  expect(summary.driftStatus).toBe('drifting-up')
  // The observed rate is loss-positive, so a rising trend reports a negative rate.
  expect(summary.observedRateKgPerWeek).toBeLessThan(0)

  await goto('/', { waitUntil: 'hydration' })

  // The Maintaining card carries the Drift Status badge.
  const card = page
    .locator('[data-slot="root"]')
    .filter({ hasText: 'Maintaining' })
  await expect(
    card.getByRole('heading', { name: 'Maintaining', level: 2 }),
  ).toBeVisible()
  await expect(card.getByText('Drifting up', { exact: true })).toBeVisible()

  // Restore the dates we touched: delete readings we minted, put originals back.
  const after = await weightList(request)
  for (const r of after) {
    if (seededDates.has(r.measuredOn) && !originalIds.has(r.id)) {
      const delW = await request.delete(`${API}/weight/${r.id}`)
      expect(delW.status()).toBe(204)
    }
  }
  for (const r of before) {
    if (seededDates.has(r.measuredOn)) {
      await postWeight(request, r.measuredOn, r.weightKg, today)
    }
  }

  // Recreate the prior active Goal, if there was one.
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
})

async function weightList(request: Request): Promise<WeightRecord[]> {
  const list = await request.get(`${API}/weight`)
  expect(list.ok()).toBe(true)
  return list.json()
}

async function postWeight(
  request: Request,
  date: string,
  weightKg: number,
  clientToday: string,
) {
  const res = await request.post(`${API}/weight`, {
    data: { date, weightKg, clientToday },
  })
  expect(res.ok()).toBe(true)
}
