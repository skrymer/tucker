export interface RollupIngredient {
  caloriesPer100g: number
  proteinPer100g: number
  grams: number
}

export interface RecipeRollup {
  totalKcal: number
  totalProtein: number
  per100gKcal: number
  per100gProtein: number
  rawSumG: number
}

/**
 * The live "Per 100 g" preview for the recipe builder (CONTEXT.md, Recipe). Each
 * ingredient contributes `grams × per-100g ÷ 100`; the batch total is then
 * re-expressed per 100 g of the finished dish's cooked weight — the same
 * conservation the backend's `Recipe.nutrition()` computes authoritatively on
 * save. Presentation only: the stored nutrition is always the backend's (ADR 0002).
 */
export function rollupRecipe(
  ingredients: RollupIngredient[],
  cookedWeightG: number,
): RecipeRollup {
  const totalKcal = ingredients.reduce(
    (sum, i) => sum + contribution(i.caloriesPer100g, i.grams),
    0,
  )
  const totalProtein = ingredients.reduce(
    (sum, i) => sum + contribution(i.proteinPer100g, i.grams),
    0,
  )
  const rawSumG = ingredients.reduce((sum, i) => sum + i.grams, 0)
  const factor = cookedWeightG > 0 ? 100 / cookedWeightG : 0
  return {
    totalKcal,
    totalProtein,
    per100gKcal: totalKcal * factor,
    per100gProtein: totalProtein * factor,
    rawSumG,
  }
}

/** What a weighed line adds to a batch, from its per-100 g figure. */
export function contribution(per100g: number, grams: number): number {
  return (per100g * grams) / 100
}

/**
 * The cook-down bar: the finished dish's weight as a share of the raw
 * ingredients, so a dish that cooks down reads as a shorter (denser) bar and
 * one that absorbs water fills the track.
 */
export function cookDownPercent(rawSumG: number, cookedWeightG: number) {
  if (rawSumG <= 0) return 0
  return Math.min(100, (cookedWeightG / rawSumG) * 100)
}
