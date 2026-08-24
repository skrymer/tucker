import type { components } from '#open-fetch-schemas/api'

type GoalProgressResponse = components['schemas']['GoalProgressResponse']

/**
 * Goal Progress as the API sends it: a 90 → 80 kg cut, trend at 86, 40% done,
 * with the observed pace still withheld — the state a Goal spends its first two
 * weeks in. Pass overrides for the axis under test.
 *
 * `Required<…>` so a new field on the wire fails typecheck here, in one place,
 * rather than leaving every call site quietly short of it.
 */
export function goalProgress(
  overrides: Partial<GoalProgressResponse> = {},
): Required<GoalProgressResponse> {
  return {
    startWeightKg: 90,
    targetWeightKg: 80,
    currentTrendKg: 86,
    kgToGo: 6,
    percentComplete: 40,
    plannedFinishDate: '2026-11-26',
    plannedRateKgPerWeek: 0.5,
    paceStatus: null,
    observedRateKgPerWeek: null,
    observedFinishDate: null,
    reachedOn: null,
    ...overrides,
  }
}
