import { test, expect } from './support/smoke-test'

// F5 slice C smoke: the goal-glance tile on /today, end-to-end against the real
// backend. No /api mocks. The tile shows percent complete and kg-to-go computed
// by the backend from the active Goal and the live Trend Weight, and the whole
// card taps through to /review.
//
// The backend is the source of truth for the figures: we read
// GET /api/goal/progress and assert the tile renders exactly those, so the test
// proves the UI ↔ API agreement rather than re-deriving the maths.
//
// A Goal and its first WeeklyReview are irreversible (no DELETE), so — like the
// other real-stack smokes — setup runs only when the volume has no active Goal,
// and otherwise reuses it. We do drive the today weight to a known point below
// the start (a clear, non-zero percent) and restore it on teardown.
const API = 'http://localhost:8080/api'

type WeightRecord = { id: number; measuredOn: string; weightKg: number }

test('the goal-glance tile shows progress and taps through to the review', async ({
  page,
  goto,
  request,
}) => {
  const today = new Date().toLocaleDateString('en-CA')

  // Remember any existing today reading so we can put it back afterwards.
  const origToday = await todayWeight(request, today)

  // Ensure an active Goal exists. A fresh volume has none, so complete setup the
  // way a real install does — profile, a weight reading, then the Goal, which
  // auto-fires the first weekly review.
  if (!(await request.get(`${API}/goal`)).ok()) {
    await request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    })
    await postWeight(request, today, 85)
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

  // Drive today's reading two kilograms into the cut, so the trend sits clearly
  // between the start and the target and progress is a non-trivial figure.
  await postWeight(request, today, activeGoal.startWeightKg - 2)

  // What the backend computes is what the tile must render.
  const progress = await (await request.get(`${API}/goal/progress`)).json()
  const percent = `${Math.round(progress.percentComplete)}%`
  const kgToGo = `${progress.kgToGo.toFixed(1)} kg to go`

  await goto('/', { waitUntil: 'hydration' })

  const tile = page.getByRole('link', { name: /goal progress/i })
  await expect(tile).toBeVisible()
  await expect(tile).toContainText(percent)
  await expect(tile).toContainText(kgToGo)

  // The whole card is the link: tapping it lands on the weekly review.
  await tile.click()
  await expect(page).toHaveURL(/\/review$/)

  // Restore the today reading we drove (or remove it if there was none).
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
