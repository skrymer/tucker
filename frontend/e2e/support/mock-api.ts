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
