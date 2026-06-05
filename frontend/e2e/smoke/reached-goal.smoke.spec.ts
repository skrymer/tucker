import { test, expect } from '@nuxt/test-utils/playwright'
import type { APIRequestContext } from '@playwright/test'

// F7 slice 2 smoke (ADR 0008): reaching a Goal end-to-end against the real
// backend. No /api mocks. We drive the live EWMA Trend Weight across a Goal's
// target, assert the backend stamps `reachedOn`, then exercise the /today fork
// banner: "Switch to maintenance" deactivates the Goal, the backend force-
// recomputes today's review to Maintenance, and the page lands on the calm
// "Maintaining" card with a lifted Budget.
//
// The trend is computed over *all* weight readings, so to make crossing
// deterministic we wipe the (shared-volume) weights, seed a known two-reading
// trend, and restore every original reading + any prior Goal in `finally` —
// even if an assertion fails.

const API = 'http://localhost:8080/api'

type WeightRecord = { id: number; measuredOn: string; weightKg: number }

test('reaching a goal surfaces the fork banner and switching to maintenance lifts the Budget', async ({
  page,
  goto,
  request,
}) => {
  const today = new Date().toLocaleDateString('en-CA')
  const earlier = isoDaysAgo(today, 7)

  // Reviews need a profile.
  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })

  // Snapshot everything we disturb so we can put it all back.
  const origWeights = await allWeights(request)
  const goalRes = await request.get(`${API}/goal`)
  const priorGoal = goalRes.ok() ? await goalRes.json() : null

  try {
    // Deterministic trend: wipe weights, start the active Goal from a clean slate.
    await deleteAllWeights(request)
    await request.delete(`${API}/goal`)

    // One reading at 80.5 → trend 80.5. Target 80.0 sits just below it, so the
    // Goal is accepted (not already reached).
    await postWeight(request, earlier, 80.5, today)
    const create = await request.post(`${API}/goal`, {
      data: {
        startedOn: today,
        startWeightKg: 90,
        targetWeightKg: 80,
        rateKgPerWeek: 0.5,
      },
    })
    expect(create.status()).toBe(201)
    expect((await progress(request)).reachedOn).toBeFalsy()

    // A 75.0 weigh-in today pulls the EWMA to ~79.95 — across the target. The
    // backend stamps reachedOn on this measurement write.
    await postWeight(request, today, 75.0, today)
    expect((await progress(request)).reachedOn).toBeTruthy()

    const cutBudget = (await summary(request, today)).calorieBudget

    await goto('/', { waitUntil: 'hydration' })

    // The insistent two-way fork: celebratory heading + the two resolving
    // actions, and no dismiss.
    await expect(
      page.getByRole('heading', { name: /you reached your goal/i }),
    ).toBeVisible()
    const switchToMaintenance = page.getByRole('button', {
      name: /switch to maintenance/i,
    })
    await expect(switchToMaintenance).toBeVisible()
    await expect(
      page.getByRole('link', { name: /set a lower goal/i }),
    ).toHaveAttribute('href', '/profile')

    await switchToMaintenance.click()

    // Lands on the Maintaining card; the Goal is deactivated and the Budget has
    // lifted to Maintenance (the deficit is gone).
    const card = page
      .locator('[data-slot="root"]')
      .filter({ hasText: 'Maintaining' })
    await expect(
      card.getByRole('heading', { name: 'Maintaining', level: 2 }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /you reached your goal/i }),
    ).toHaveCount(0)

    expect((await request.get(`${API}/goal`)).status()).toBe(404)
    expect((await summary(request, today)).calorieBudget).toBeGreaterThan(
      cutBudget,
    )
  } finally {
    // Restore the original weights and any prior active Goal. Best-effort: no
    // throwing assertions here so cleanup can't mask the test's own verdict.
    await deleteAllWeights(request)
    for (const w of origWeights) {
      await postWeight(request, w.measuredOn, w.weightKg, today)
    }
    if (priorGoal) {
      await request.post(`${API}/goal`, {
        data: {
          startedOn: priorGoal.startedOn,
          startWeightKg: priorGoal.startWeightKg,
          targetWeightKg: priorGoal.targetWeightKg,
          rateKgPerWeek: priorGoal.rateKgPerWeek,
        },
      })
    }
  }
})

function isoDaysAgo(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA')
}

async function allWeights(request: APIRequestContext): Promise<WeightRecord[]> {
  const res = await request.get(`${API}/weight`)
  expect(res.ok()).toBe(true)
  return (await res.json()) as WeightRecord[]
}

async function deleteAllWeights(request: APIRequestContext) {
  for (const w of await allWeights(request)) {
    await request.delete(`${API}/weight/${w.id}`)
  }
}

async function postWeight(
  request: APIRequestContext,
  date: string,
  weightKg: number,
  clientToday: string,
) {
  // `date` may be backdated, but `clientToday` must be the real local date — the
  // backend rejects a clientToday more than a day off the server clock.
  const res = await request.post(`${API}/weight`, {
    data: { date, weightKg, clientToday },
  })
  expect(res.ok()).toBe(true)
}

async function progress(request: APIRequestContext) {
  const res = await request.get(`${API}/goal/progress`)
  expect(res.ok()).toBe(true)
  return await res.json()
}

async function summary(request: APIRequestContext, date: string) {
  const res = await request.get(`${API}/summary?date=${date}`)
  expect(res.ok()).toBe(true)
  return await res.json()
}
