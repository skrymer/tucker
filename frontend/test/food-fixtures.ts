import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

/**
 * A catalog Food as `GET /api/foods` sends it.
 *
 * What this factory is faithful about is the *shape*: the optional fields
 * default to `null` rather than being left out, because that is what the wire
 * carries — Tucker serializes an absent value as an explicit `null` (ADR 0023),
 * and a fixture that omits them describes a payload the backend never produces.
 * It is deliberately not faithful about the *figures*: the default macros do not
 * add up to the default calories under Atwater. Nothing in the frontend
 * re-derives one from the other (ADR 0002 — the backend does that), so a test
 * that needs the relation to hold has to state all four itself.
 *
 * The return is `Required<FoodResponse>`, not `FoodResponse`, and that is what
 * makes this a single point of change rather than a smaller pile of them: every
 * nullable field is *optional* in the generated type, so a plain `FoodResponse`
 * return would let a newly added field go missing here in silence. Requiring
 * every key means the day one lands, `pnpm typecheck` fails on this file and
 * names it.
 *
 * Defaults come before the spread, so a caller's partial wins.
 */
export function food(
  partial: Partial<FoodResponse> & { id: number; name: string },
): Required<FoodResponse> {
  return {
    kind: 'FOOD',
    barcode: null,
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 0,
    fatPer100g: 0,
    cookedWeightG: null,
    ingredientCount: null,
    ...partial,
  }
}

/**
 * A Recipe in its catalog form — the same row shape with `kind = RECIPE`.
 *
 * The cooked weight and the ingredient count are required rather than
 * defaulted, unlike everything else here. Both are *derived* from a specific
 * composition — the count mirrors the ingredient lines, the weight is what that
 * batch finished at — so a default is not a harmless placeholder but a claim
 * about a dish the caller described differently. Requiring them costs one line
 * at the callers that already state them (seven of the eight) and stops the
 * eighth from quietly saying two ingredients about a one-ingredient recipe.
 *
 * Carbs and fat are `null` because the rollup conserves only calories and
 * protein (`Recipe.nutrition()`). `kind` is fixed, not defaulted, so it cannot
 * be overridden into something a recipe is not.
 */
export function recipe(
  partial: Omit<Partial<FoodResponse>, 'kind'> & {
    id: number
    name: string
    cookedWeightG: number
    ingredientCount: number
  },
): Required<FoodResponse> {
  return food({
    carbsPer100g: null,
    fatPer100g: null,
    ...partial,
    kind: 'RECIPE',
  })
}
