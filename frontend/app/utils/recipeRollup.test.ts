import { describe, expect, it } from 'vitest'
import { rollupRecipe } from './recipeRollup'

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
