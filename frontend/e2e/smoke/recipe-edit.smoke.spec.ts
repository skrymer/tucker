import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F9 Slice 3 smoke: the full UI → API → DB path for recalibrating a Recipe
// against the real backend, and the guarantee that editing rewrites no history.
// Seeds an ingredient Food, a Recipe, and one logged portion, then edits the
// cooked weight through the composition view's builder and asserts:
//   - the recipe's stored per-100 g changed (the new density),
//   - a fresh log uses the new density,
//   - the already-logged Entry keeps its snapshot (unchanged).
// Cleans up so the docker volume is unchanged between runs.
test('editing a recipe recalibrates future logs while leaving a past log untouched', async ({
  page,
  goto,
  request,
}) => {
  // Building/editing a recipe through the UI spans an SPA navigation and many
  // field interactions against the real backend — more than the default budget.
  test.slow()

  const API = 'http://localhost:8080/api'
  const stamp = Date.now()
  const ingredientName = `Smoke chicken ${stamp}`
  const recipeName = `Smoke pie ${stamp}`

  // Ingredient is 4 × 25 = 100 kcal /100g. 400 g in, cooked to 200 g → 200 kcal
  // /100g. Halving the cooked weight to 100 g doubles it to 400 kcal /100g.
  const ingredient = await seedFood(ingredientName, {
    protein: 25,
    carbs: 0,
    fat: 0,
  })

  let recipeId: number | undefined
  let firstEntryId: number | undefined
  let secondEntryId: number | undefined
  try {
    const createdRecipe = await request.post(`${API}/recipes`, {
      data: {
        name: recipeName,
        cookedWeightG: 200,
        ingredients: [{ foodId: ingredient.id, grams: 400 }],
      },
    })
    expect(createdRecipe.status()).toBe(201)
    recipeId = ((await createdRecipe.json()) as { id: number }).id

    // Log 100 g of the finished dish before the edit: 200 kcal is snapshotted.
    const firstEntry = await request.post(`${API}/entries/weighed`, {
      data: { date: todayIso(), foodId: recipeId, grams: 100 },
    })
    expect(firstEntry.status()).toBe(201)
    const firstBody = (await firstEntry.json()) as {
      id: number
      calories: number
    }
    firstEntryId = firstBody.id
    expect(firstBody.calories).toBeCloseTo(200, 1)

    // Recalibrate the cooked weight through the composition view's edit builder.
    await goto('/foods', { waitUntil: 'hydration' })
    await page
      .getByRole('button', { name: `View ingredients in ${recipeName}` })
      .click()
    const sheet = page.getByRole('dialog', { name: new RegExp(recipeName) })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: /edit recipe/i }).click()

    const cooked = sheet.getByLabel(/cooked weight/i)
    await expect(cooked).toHaveValue('200')
    // Cook it down to 100 g. Blur so the number field commits before saving.
    await cooked.click({ clickCount: 3 })
    await page.keyboard.type('100')
    await page.keyboard.press('Tab')
    await sheet.getByRole('button', { name: /save changes/i }).click()
    await expect(sheet).toBeHidden()

    // The stored Recipe reflects the recalibration: cooked weight 100 g, density
    // doubled to 400 kcal /100g.
    const reread = await request.get(`${API}/recipes/${recipeId}`)
    expect(reread.status()).toBe(200)
    expect(
      ((await reread.json()) as { cookedWeightG: number }).cookedWeightG,
    ).toBeCloseTo(100, 1)

    const foodsList = await request.get(`${API}/foods`)
    const foods = (await foodsList.json()) as Array<{
      id: number
      caloriesPer100g: number
    }>
    const recipeRow = foods.find((f) => f.id === recipeId)
    expect(recipeRow?.caloriesPer100g).toBeCloseTo(400, 1)

    // A fresh log of the same 100 g portion now uses the new density: 400 kcal.
    const secondEntry = await request.post(`${API}/entries/weighed`, {
      data: { date: todayIso(), foodId: recipeId, grams: 100 },
    })
    expect(secondEntry.status()).toBe(201)
    const secondBody = (await secondEntry.json()) as {
      id: number
      calories: number
    }
    secondEntryId = secondBody.id
    expect(secondBody.calories).toBeCloseTo(400, 1)

    // History is safe: the earlier Entry keeps its 200 kcal snapshot.
    const entriesList = await request.get(`${API}/entries`, {
      params: { date: todayIso() },
    })
    const entries = (await entriesList.json()) as Array<{
      id: number
      calories: number
    }>
    const firstAfter = entries.find((e) => e.id === firstEntryId)
    expect(firstAfter?.calories).toBeCloseTo(200, 1)
  } finally {
    // Entry pins its Food; delete the Entries, then the Recipe (cascades its
    // ingredient lines), then the freed ingredient Food.
    for (const id of [firstEntryId, secondEntryId]) {
      if (id !== undefined) await request.delete(`${API}/entries/${id}`)
    }
    if (recipeId !== undefined) await request.delete(`${API}/foods/${recipeId}`)
    await request.delete(`${API}/foods/${ingredient.id}`)
  }

  async function seedFood(
    name: string,
    macros: { protein: number; carbs: number; fat: number },
  ): Promise<{ id: number }> {
    const res = await request.post(`${API}/foods`, {
      data: {
        name,
        proteinPer100g: macros.protein,
        carbsPer100g: macros.carbs,
        fatPer100g: macros.fat,
      },
    })
    expect(res.status()).toBe(201)
    return (await res.json()) as { id: number }
  }
})
