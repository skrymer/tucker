import type { Page } from '@playwright/test'

type Json = Record<string, unknown>

/** A daily summary with no entries and no budget — the pre-first-review state. */
const emptySummary: Json = {
  date: '2026-05-22',
  caloriesConsumed: 0,
  proteinConsumed: 0,
  estimatedCalorieShare: 0,
  calorieBudget: null,
  proteinFloor: null,
  caloriesRemaining: null,
  onTarget: null,
  entries: [],
}

/**
 * Stub `GET /api/summary` so any page that loads it renders without a real
 * backend. Pass a summary to assert against; omit it for a neutral default.
 */
export async function mockSummary(page: Page, summary: Json = emptySummary) {
  await page.route('**/api/summary**', (route) =>
    route.fulfill({ json: summary }),
  )
}

/**
 * Stub `GET /api/foods` so the Foods page renders without a real backend.
 * Pass an array of foods, or omit for the empty-catalog state.
 */
export async function mockFoods(page: Page, foods: Json[] = []) {
  await page.route('**/api/foods', (route) => route.fulfill({ json: foods }))
}

/** Stub `GET /api/profile` returning a saved profile. */
export async function mockProfile(page: Page, profile: Json) {
  await page.route('**/api/profile', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: profile })
    return route.fallback()
  })
}

/** Stub `GET /api/profile` returning 404 — no profile yet. */
export async function mockNoProfile(page: Page) {
  await page.route('**/api/profile', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 404, json: { message: 'Not found' } })
    }
    return route.fallback()
  })
}

/**
 * Stub `GET /api/weight/latest` + `POST /api/weight` so the weight tile on
 * `/today` works without a real backend. Starts with no measurements; the
 * first POST seeds an in-memory record that subsequent GETs return.
 */
export async function mockWeightApi(
  page: Page,
  initial: { id: number; measuredOn: string; weightKg: number } | null = null,
) {
  let latest = initial
  let nextId = (initial?.id ?? 0) + 1

  await page.route('**/api/weight/latest', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    if (latest === null) {
      return route.fulfill({ status: 404, json: { message: 'Not found' } })
    }
    return route.fulfill({ json: latest })
  })

  await page.route('**/api/weight', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postDataJSON() as {
      date: string
      weightKg: number
    }
    latest = { id: nextId++, measuredOn: body.date, weightKg: body.weightKg }
    return route.fulfill({ status: 200, json: latest })
  })
}

/**
 * Stub `GET /api/goal` + `GET /api/goal/progress` returning 404 — no active
 * Goal. The Today page reads this as Maintenance Mode (ADR 0008).
 */
export async function mockNoActiveGoal(page: Page) {
  for (const path of ['**/api/goal', '**/api/goal/progress']) {
    await page.route(path, (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ status: 404, json: { message: 'no active Goal' } })
    })
  }
}

type GoalSeed = {
  id: number
  startedOn: string
  startWeightKg: number
  targetWeightKg: number
  rateKgPerWeek: number
  active: boolean
}

/**
 * Stub `GET /api/goals` (history, newest first) + `POST /api/goal` so the Goal
 * section on `/profile` works without a real backend. Each POST deactivates the
 * prior active goal and prepends the new active one, mirroring the backend's
 * replacement semantics; `dailyDeficitKcal` is derived as the real domain does.
 */
export async function mockGoals(
  page: Page,
  initial: GoalSeed[] = [],
  options: { rejectTargetAtOrAbove?: number } = {},
) {
  const goals = [...initial]
  let nextId = Math.max(0, ...goals.map((g) => g.id)) + 1

  const withDeficit = (g: GoalSeed) => ({
    ...g,
    dailyDeficitKcal: (g.rateKgPerWeek * 7700) / 7,
  })

  await page.route('**/api/goals', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ json: goals.map(withDeficit) })
  })

  await page.route('**/api/goal', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postDataJSON() as Omit<
      GoalSeed,
      'id' | 'active'
    >
    // Mirror the backend's trend-weight guard (ADR 0008): a target at or above
    // the current Trend Weight is already-reached and rejected with a 400.
    const floor = options.rejectTargetAtOrAbove
    if (floor !== undefined && body.targetWeightKg >= floor) {
      return route.fulfill({
        status: 400,
        json: {
          message: `a weight-loss Goal needs a target below your current trend weight (${floor.toFixed(1)} kg)`,
        },
      })
    }
    goals.forEach((g) => (g.active = false))
    const created: GoalSeed = { id: nextId++, active: true, ...body }
    goals.unshift(created)
    return route.fulfill({ status: 201, json: withDeficit(created) })
  })
}

/**
 * Stub the `GET /api/weight` list + `POST /api/weight` upsert so the Weight
 * section on `/profile` works without a real backend. Starts from `initial`;
 * each POST upserts by date (replacing a same-date reading) so re-logging a
 * date behaves like the real backend.
 */
export async function mockWeightList(
  page: Page,
  initial: Array<{ id: number; measuredOn: string; weightKg: number }> = [],
) {
  const records = [...initial]
  let nextId = Math.max(0, ...records.map((r) => r.id)) + 1

  await page.route('**/api/weight', (route) => {
    const method = route.request().method()
    if (method === 'GET') return route.fulfill({ json: records })
    if (method === 'POST') {
      const body = route.request().postDataJSON() as {
        date: string
        weightKg: number
      }
      const existing = records.find((r) => r.measuredOn === body.date)
      if (existing) {
        existing.weightKg = body.weightKg
        return route.fulfill({ status: 200, json: existing })
      }
      const created = {
        id: nextId++,
        measuredOn: body.date,
        weightKg: body.weightKg,
      }
      records.push(created)
      return route.fulfill({ status: 200, json: created })
    }
    return route.fallback()
  })
}
