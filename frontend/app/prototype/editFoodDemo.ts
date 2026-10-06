// PROTOTYPE — throwaway in-memory catalog for "edit a Food". Dev builds only.
// Delete before any real slice.

export interface DemoFood {
  id: number
  name: string
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  tags: string[]
}

export interface DemoRecipe {
  id: number
  name: string
  cookedWeightG: number
  ingredients: { foodId: number; grams: number }[]
}

export const kcalOf = (
  f: Pick<DemoFood, 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'>,
) => 4 * f.proteinPer100g + 4 * f.carbsPer100g + 9 * f.fatPer100g

export function demoCatalog() {
  const foods: DemoFood[] = [
    {
      id: 1,
      name: 'Olive oil',
      proteinPer100g: 0,
      carbsPer100g: 0,
      fatPer100g: 100,
      tags: ['Pantry'],
    },
    {
      id: 2,
      name: 'Rolled oats',
      proteinPer100g: 13,
      carbsPer100g: 60,
      fatPer100g: 7,
      tags: ['Breakfast'],
    },
    {
      id: 3,
      name: 'Chicken breast',
      proteinPer100g: 31,
      carbsPer100g: 0,
      fatPer100g: 3.6,
      tags: ['Protein', 'Dinner'],
    },
    {
      id: 4,
      name: 'Skyr 1.5%',
      proteinPer100g: 11,
      carbsPer100g: 4,
      fatPer100g: 1.5,
      tags: [],
    },
    {
      id: 5,
      name: 'Brown rice',
      proteinPer100g: 2.6,
      carbsPer100g: 23,
      fatPer100g: 0.9,
      tags: ['Pantry'],
    },
    {
      id: 6,
      name: 'Garlic',
      proteinPer100g: 6.4,
      carbsPer100g: 33,
      fatPer100g: 0.5,
      tags: [],
    },
  ]
  const oilRecipes = [
    'Chili con carne',
    'Chicken stir-fry',
    'Roast vegetables',
    'Bolognese',
    'Shakshuka',
    'Lentil soup',
    'Green curry',
    'Fried rice',
    'Pesto pasta',
    'Ratatouille',
    'Fish tacos',
    'Minestrone',
    'Beef ragù',
    'Hummus',
  ]
  const recipes: DemoRecipe[] = oilRecipes.map((name, i) => ({
    id: 100 + i,
    name,
    cookedWeightG: 1200 + i * 50,
    ingredients: [
      { foodId: 1, grams: 15 + i * 2 },
      { foodId: 6, grams: 10 },
      ...(i % 3 === 0 ? [{ foodId: 3, grams: 500 }] : []),
      ...(i % 4 === 1 ? [{ foodId: 5, grams: 300 }] : []),
    ],
  }))
  recipes.push({
    id: 200,
    name: 'Overnight oats',
    cookedWeightG: 450,
    ingredients: [
      { foodId: 2, grams: 80 },
      { foodId: 4, grams: 200 },
    ],
  })
  return { foods: reactive(foods), recipes }
}

/** Calories per 100 g of a recipe, given each ingredient's (possibly draft) kcal/100 g. */
export function recipeKcalPer100g(
  recipe: DemoRecipe,
  kcalPer100gOf: (foodId: number) => number,
) {
  const total = recipe.ingredients.reduce(
    (sum, line) => sum + (kcalPer100gOf(line.foodId) * line.grams) / 100,
    0,
  )
  return (total / recipe.cookedWeightG) * 100
}
