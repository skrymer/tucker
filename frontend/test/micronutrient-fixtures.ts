import type { components } from '#open-fetch-schemas/api'

type MicronutrientIntakeResponse =
  components['schemas']['MicronutrientIntakeResponse']
type UnmatchedFoodResponse = components['schemas']['UnmatchedFoodResponse']
type MicronutrientRowResponse =
  components['schemas']['MicronutrientRowResponse']
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
    share: 0.27,
    ...overrides,
  }
}

/**
 * One nutrient's row as the API sends it, for a nutrient Tucker *can* state: a
 * figure, the line it was read against, and the claim that earned them.
 */
export function micronutrientRow(
  overrides: Partial<MicronutrientRowResponse> = {},
): Required<MicronutrientRowResponse> {
  return {
    nutrient: 'IRON',
    label: 'Iron',
    unit: 'mg',
    amount: 21.4,
    recommended: 18,
    limit: { amount: 45, kind: 'UPPER_LEVEL' },
    claim: 'CLEARS_REFERENCE',
    ...overrides,
  }
}

/**
 * A row Tucker cannot state, which is the ordinary case at its structurally poor
 * coverage. Its own builder rather than an override, because the API withholds
 * every figure from such a row — a fixture carrying them would be a shape the
 * backend cannot produce, which is exactly what a mutation sweep sails past.
 */
export function unstatedMicronutrientRow(
  overrides: Partial<MicronutrientRowResponse> = {},
): Required<MicronutrientRowResponse> {
  return micronutrientRow({
    amount: null,
    recommended: null,
    limit: null,
    claim: 'NOT_ENOUGH_MATCHED',
    ...overrides,
  })
}

/** A window's Micronutrient Intake as the API sends it. */
export function micronutrientIntake(
  overrides: Partial<MicronutrientIntakeResponse> = {},
): Required<MicronutrientIntakeResponse> {
  return {
    from: '2026-08-21',
    to: '2026-08-27',
    totalCalories: 1935,
    loggedDays: 7,
    coverage: 0.62,
    hasReferenceIntakes: true,
    rows: [micronutrientRow()],
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
