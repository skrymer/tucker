import type { components } from '#open-fetch-schemas/api'

type WeeklyReviewResponse = components['schemas']['WeeklyReviewResponse']
type IntakeTargetsResponse = NonNullable<WeeklyReviewResponse['intakeTargets']>

/**
 * The intake half of a review as the API sends it — an adaptive week at a 1900
 * kcal Budget. Pass overrides for the axis under test.
 *
 * `Required<…>` so a new field on the wire fails typecheck here, in one place,
 * rather than leaving every call site quietly short of it.
 */
export function intakeTargets(
  overrides: Partial<IntakeTargetsResponse> = {},
): Required<IntakeTargetsResponse> {
  return {
    maintenanceKcal: 2400,
    maintenanceBasis: 'ADAPTIVE',
    calorieBudgetKcal: 1900,
    proteinFloorG: 170,
    ...overrides,
  }
}

/**
 * A Weekly Review as the API sends it. Targets are present by default, which is
 * the tracking User's review; pass `{ intakeTargets: null }` for one run with
 * Calorie Tracking off.
 */
export function weeklyReview(
  overrides: Partial<WeeklyReviewResponse> = {},
): Required<WeeklyReviewResponse> {
  return {
    id: 1,
    reviewedOn: '2026-06-01',
    trendWeightKg: 85,
    intakeTargets: intakeTargets(),
    ...overrides,
  }
}
