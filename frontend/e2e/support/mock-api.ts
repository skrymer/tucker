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
