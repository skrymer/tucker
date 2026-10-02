import type { Page } from '@playwright/test'

type Json = Record<string, unknown>

/** A daily summary with no entries and no budget — the pre-first-review state. */
const emptySummary: Json = {
  date: '2026-05-22',
  setupComplete: false,
  caloriesConsumed: 0,
  proteinConsumed: 0,
  estimatedCalorieShare: 0,
  calorieBudget: null,
  proteinFloor: null,
  caloriesRemaining: null,
  dayStatus: null,
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

/**
 * Stub `GET /api/foods/frequent`, recording every window asked for. Registered
 * before `mockFoods` in a spec that needs both is fine — the two globs are
 * distinct, and `**\/api/foods` does not reach a nested path.
 */
export async function mockFrequentFoods(
  page: Page,
  foods: Json[] = [],
): Promise<{ from: string; to: string }[]> {
  const asked: { from: string; to: string }[] = []
  await page.route('**/api/foods/frequent**', (route) => {
    const params = new URL(route.request().url()).searchParams
    asked.push({ from: params.get('from') ?? '', to: params.get('to') ?? '' })
    return route.fulfill({ json: foods })
  })
  return asked
}

/** Stub `GET /api/profile` returning a saved profile. */
export async function mockProfile(page: Page, profile: Json) {
  await page.route('**/api/profile*', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: profile })
    return route.fallback()
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
