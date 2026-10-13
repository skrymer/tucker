import { describe, expect, it } from 'vitest'
import {
  contribution,
  cookDownPercent,
  previewRecipeFigures,
  rollupRecipe,
} from './recipeRollup'

/**
 * A stew as the backend composes it: 300 g mince (4 × 31 + 9 × 10 = 214 kcal)
 * and 100 g onion (4 × 1 + 4 × 9 = 40 kcal), cooked down to 200 g.
 */
const stew = {
  id: 9,
  name: 'Stew',
  cookedWeightG: 200,
  ingredients: [
    { foodId: 1, grams: 300, caloriesPer100g: 214, proteinPer100g: 31 },
    { foodId: 2, grams: 100, caloriesPer100g: 40, proteinPer100g: 1 },
  ],
}
const mince = { proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 10 }

describe('previewRecipeFigures', () => {
  it('reads what the backend rolled the Recipe up to while the Food is unchanged', () => {
    // (642 + 40) / 200 × 100 = 341 kcal; (93 + 1) / 200 × 100 = 47 g protein —
    // the figures FoodRecipesApiTest's stew is stored with.
    expect(previewRecipeFigures(stew, 1, mince)).toEqual({
      kcal: 341,
      protein: 47,
    })
  })

  it('moves the Recipe by the corrected ingredient’s share alone', () => {
    // Mince corrected to 13 g protein: 4 × 13 + 9 × 10 = 142 kcal. The onion's
    // 40 kcal and 1 g protein stand: (426 + 40) / 200 × 100 = 233 kcal and
    // (39 + 1) / 200 × 100 = 20 g protein.
    expect(
      previewRecipeFigures(stew, 1, { ...mince, proteinPer100g: 13 }),
    ).toEqual({ kcal: 233, protein: 20 })
  })
})

describe('rollupRecipe', () => {
  it('re-expresses the ingredient totals per 100 g of the cooked weight', () => {
    // 500 g @ 100 kcal + 500 g @ 200 kcal = 1500 kcal; 50 g + 100 g = 150 g protein.
    // Over a 750 g finished dish: 1500 / 750 * 100 = 200 kcal, 20 g protein /100g.
    const rollup = rollupRecipe(
      [
        { caloriesPer100g: 100, proteinPer100g: 10, grams: 500 },
        { caloriesPer100g: 200, proteinPer100g: 20, grams: 500 },
      ],
      750,
    )

    expect(rollup.totalKcal).toBe(1500)
    expect(rollup.totalProtein).toBe(150)
    expect(rollup.per100gKcal).toBe(200)
    expect(rollup.per100gProtein).toBe(20)
  })

  it('exposes the raw ingredient sum, the default cooked weight before it is edited', () => {
    const rollup = rollupRecipe(
      [
        { caloriesPer100g: 100, proteinPer100g: 10, grams: 320 },
        { caloriesPer100g: 200, proteinPer100g: 20, grams: 80 },
      ],
      400,
    )

    expect(rollup.rawSumG).toBe(400)
  })

  it('reads zero per 100 g when the cooked weight is not yet a positive number', () => {
    const rollup = rollupRecipe(
      [{ caloriesPer100g: 100, proteinPer100g: 10, grams: 500 }],
      0,
    )

    // The totals still stand; only the per-100g division waits for a weight.
    expect(rollup.totalKcal).toBe(500)
    expect(rollup.per100gKcal).toBe(0)
    expect(rollup.per100gProtein).toBe(0)
  })
})

describe('contribution', () => {
  it('is what a weighed line adds to the batch: grams × per-100 g ÷ 100', () => {
    expect(contribution(170, 250)).toBe(425)
    expect(contribution(41, 0)).toBe(0)
  })
})

describe('cookDownPercent', () => {
  it('is the cooked weight as a share of the raw ingredients', () => {
    expect(cookDownPercent(300, 200)).toBeCloseTo(66.67, 2)
  })

  it('fills the bar, no further, for a dish that took on water', () => {
    expect(cookDownPercent(300, 450)).toBe(100)
  })

  it('is empty until there are ingredients to weigh against', () => {
    expect(cookDownPercent(0, 250)).toBe(0)
  })
})
