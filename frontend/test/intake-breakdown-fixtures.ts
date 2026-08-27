import type { components } from '#open-fetch-schemas/api'

type IntakeBreakdownResponse = components['schemas']['IntakeBreakdownResponse']
type IntakeBreakdownItemResponse =
  components['schemas']['IntakeBreakdownItemResponse']

/**
 * One slice as the API sends it. `Required<…>` so a new field on the wire fails
 * typecheck here rather than leaving every call site quietly short of it.
 */
export function breakdownItem(
  overrides: Partial<IntakeBreakdownItemResponse> = {},
): Required<IntakeBreakdownItemResponse> {
  return {
    foodId: 1,
    name: 'Chicken breast',
    calories: 520,
    protein: 97,
    share: 0.27,
    isEstimate: false,
    ...overrides,
  }
}

/** A day's Intake Breakdown as the API sends it. */
export function intakeBreakdown(
  overrides: Partial<IntakeBreakdownResponse> = {},
): Required<IntakeBreakdownResponse> {
  return {
    from: '2026-08-27',
    to: '2026-08-27',
    totalCalories: 1935,
    items: [breakdownItem()],
    ...overrides,
  }
}
