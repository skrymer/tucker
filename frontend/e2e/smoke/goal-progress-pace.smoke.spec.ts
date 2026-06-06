import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays, formatDmy } from '../support/date'

// F5 slice E smoke: the full Goal Progress hero on /review, end-to-end against
// the real backend. No /api mocks. We seed a month of steadily-falling weight
// history so the backend has enough to read an *observed pace* from, then assert
// the hero renders exactly what GET /api/goal/progress returns — its planned and
// observed finish dates and its pace label — proving UI ↔ API agreement rather
// than re-deriving the maths (which the unit/component tests pin).
//
// A Goal and its first WeeklyReview are irreversible (no DELETE), so — like the
// other real-stack smokes — Goal setup runs only when the volume has none, and
// otherwise reuses it. The weight history we seed *is* reversible: we snapshot
// the readings on the dates we touch and restore them (or delete ours) at the end.
const API = 'http://localhost:8080/api'

type WeightRecord = { id: number; measuredOn: string; weightKg: number }
type Request = Parameters<Parameters<typeof test>[1]>[0]['request']

test('the Goal Progress hero shows planned vs observed finish and the pace', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // Ensure an active Goal exists. A fresh volume has none, so complete setup the
  // way a real install does — profile, a weight reading, then the Goal.
  if (!(await request.get(`${API}/goal`)).ok()) {
    await request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    })
    await postWeight(request, today, 85, today)
    const goal = await request.post(`${API}/goal`, {
      data: {
        startedOn: today,
        startWeightKg: 85,
        targetWeightKg: 80,
        rateKgPerWeek: 0.5,
      },
    })
    expect(goal.status()).toBe(201)
  }

  const activeGoal = await (await request.get(`${API}/goal`)).json()

  // Seed a steadily-falling 28-day trend that keeps the current weight clearly
  // above the target, so the observed pace is real and not stalled. The drop is
  // a fraction of the remaining gap, so it works for any reused Goal.
  const start = activeGoal.startWeightKg
  const drop = Math.min(2, (start - activeGoal.targetWeightKg) * 0.4)
  const window = 28
  const seeded: Array<{ date: string; weightKg: number }> = []
  for (let day = 0; day <= window; day++) {
    seeded.push({
      date: isoShiftDays(today, day - window),
      weightKg: Number((start - (drop * day) / window).toFixed(1)),
    })
  }

  // Snapshot the readings on the dates we're about to overwrite, to restore them.
  const before = await weightList(request)
  const seededDates = new Set(seeded.map((s) => s.date))
  const originalIds = new Set(before.map((r) => r.id))

  for (const { date, weightKg } of seeded) {
    await postWeight(request, date, weightKg, today)
  }

  // What the backend computes is what the hero must render.
  const progress = await (await request.get(`${API}/goal/progress`)).json()
  expect(progress.paceStatus).toBeTruthy()
  expect(progress.observedFinishDate).toBeTruthy()

  // Format the dates the way the app's `formatDateFromISO` does, so the expected
  // strings match the rendered ones. Built from the date parts (shared helper),
  // so the result is timezone-independent.
  const plannedText = formatDmy(progress.plannedFinishDate)
  const observedText = formatDmy(progress.observedFinishDate)
  const paceLabel = PACE_LABELS[progress.paceStatus as keyof typeof PACE_LABELS]
  const percent = `${Math.round(progress.percentComplete)}%`

  await goto('/review', { waitUntil: 'hydration' })

  // The hero is the card headed "Goal progress", above the ledger.
  const hero = page
    .locator('[data-slot="root"]')
    .filter({ hasText: 'Goal progress' })
  await expect(hero).toBeVisible()
  await expect(hero.getByText(percent)).toBeVisible()
  // Planned and observed finish, side by side — the comparison is the story.
  await expect(hero.getByText('Planned finish')).toBeVisible()
  await expect(hero.getByText('Observed finish')).toBeVisible()
  await expect(hero.getByText(plannedText)).toBeVisible()
  await expect(hero.getByText(observedText)).toBeVisible()
  await expect(hero.getByText(paceLabel)).toBeVisible()

  // Restore the dates we touched: put originals back, delete readings we minted.
  const after = await weightList(request)
  for (const r of after) {
    if (seededDates.has(r.measuredOn) && !originalIds.has(r.id)) {
      const del = await request.delete(`${API}/weight/${r.id}`)
      expect(del.status()).toBe(204)
    }
  }
  for (const r of before) {
    if (seededDates.has(r.measuredOn)) {
      await postWeight(request, r.measuredOn, r.weightKg, today)
    }
  }
})

const PACE_LABELS = {
  behind: 'Behind',
  'on-pace': 'On pace',
  ahead: 'Ahead',
  stalled: 'Stalled',
}

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
