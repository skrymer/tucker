import type { components } from '#open-fetch-schemas/api'

type MicronutrientIntakeResponse =
  components['schemas']['MicronutrientIntakeResponse']
type UnmatchedFoodResponse = components['schemas']['UnmatchedFoodResponse']
type ReferenceFoodSearchResponse =
  components['schemas']['ReferenceFoodSearchResponse']
type ReferenceFoodCandidateResponse =
  components['schemas']['ReferenceFoodCandidateResponse']

/**
 * One row of the match queue as the API sends it. `Required<…>` so a new field
 * on the wire fails typecheck here rather than leaving every call site short.
 */
export function unmatchedFood(
  overrides: Partial<UnmatchedFoodResponse> = {},
): Required<UnmatchedFoodResponse> {
  return {
    foodId: 1,
    name: 'Chicken breast',
    calories: 520,
    share: 0.27,
    ...overrides,
  }
}

/** A window's Micronutrient Intake as the API sends it. */
export function micronutrientIntake(
  overrides: Partial<MicronutrientIntakeResponse> = {},
): Required<MicronutrientIntakeResponse> {
  return {
    from: '2026-08-21',
    to: '2026-08-27',
    totalCalories: 1935,
    coverage: 0.62,
    unmatched: [unmatchedFood()],
    ...overrides,
  }
}

/** One Reference Food a search reached. */
export function referenceFoodCandidate(
  overrides: Partial<ReferenceFoodCandidateResponse> = {},
): Required<ReferenceFoodCandidateResponse> {
  return {
    id: 101,
    name: 'Chicken, breast, lean flesh, raw',
    distinguishing: [
      { nutrient: 'IRON', label: 'Iron', unit: 'mg', amount: 0.4 },
      { nutrient: 'ZINC', label: 'Zinc', unit: 'mg', amount: 0.8 },
      { nutrient: 'SELENIUM', label: 'Selenium', unit: 'µg', amount: 18 },
    ],
    ...overrides,
  }
}

/** What a Reference Food search came back with. */
export function referenceFoodSearch(
  overrides: Partial<ReferenceFoodSearchResponse> = {},
): Required<ReferenceFoodSearchResponse> {
  return {
    suggestedId: 101,
    candidates: [referenceFoodCandidate()],
    ...overrides,
  }
}
