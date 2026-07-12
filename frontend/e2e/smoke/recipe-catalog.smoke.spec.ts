import { test, expect } from './support/smoke-test'

// F9 Slice 2 smoke: the full UI → API → DB path for the catalog distinction and
// the read-only composition view against the real backend. Seeds two ingredient
// Foods and a Recipe, opens /foods, asserts the recipe wears the chip + subline
// while a plain Food is unchanged, and opens the composition. Cleans up so the
// docker volume is unchanged between runs.
test('a seeded recipe reads as a recipe in the catalog and shows its composition', async ({
  page,
  goto,
  request,
}) => {
  const API = 'http://localhost:8080/api'
  const stamp = Date.now()
  const minceName = `Smoke mince ${stamp}`
  const potatoName = `Smoke potato ${stamp}`
  const recipeName = `Smoke pie ${stamp}`

  const mince = await seedFood(minceName, { protein: 20, carbs: 0, fat: 10 })
  const potato = await seedFood(potatoName, { protein: 2, carbs: 17, fat: 0 })

  let recipeId: number | undefined
  try {
    const created = await request.post(`${API}/recipes`, {
      data: {
        name: recipeName,
        cookedWeightG: 1400,
        ingredients: [
          { foodId: mince.id, grams: 500 },
          { foodId: potato.id, grams: 900 },
        ],
      },
    })
    expect(created.status()).toBe(201)
    recipeId = ((await created.json()) as { id: number }).id

    await goto('/foods', { waitUntil: 'hydration' })

    // The recipe row wears the chip and the "N ingredients · makes X g" subline.
    const recipeRow = page.getByRole('listitem').filter({ hasText: recipeName })
    await expect(recipeRow.getByText('Recipe')).toBeVisible()
    await expect(
      recipeRow.getByText(/2 ingredients · makes 1,400 g/),
    ).toBeVisible()

    // A plain ingredient Food is unchanged: no chip, no view button.
    const foodRow = page.getByRole('listitem').filter({ hasText: minceName })
    await expect(foodRow.getByText('Recipe')).toHaveCount(0)
    await expect(
      foodRow.getByRole('button', { name: /view ingredients/i }),
    ).toHaveCount(0)

    // The view button opens the read-only composition — ingredient lines + makes.
    await recipeRow
      .getByRole('button', { name: `View ingredients in ${recipeName}` })
      .click()
    const sheet = page.getByRole('dialog', { name: new RegExp(recipeName) })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText(minceName)).toBeVisible()
    await expect(sheet.getByText('500 g')).toBeVisible()
    await expect(sheet.getByText(potatoName)).toBeVisible()
    await expect(sheet.getByText('900 g')).toBeVisible()
    await expect(sheet.getByText('1,400 g')).toBeVisible()
  } finally {
    // A Recipe's delete cascades its ingredient lines, freeing the ingredient
    // Foods to be deleted. No Entry is logged here, so nothing pins them.
    if (recipeId !== undefined) {
      await request.delete(`${API}/foods/${recipeId}`)
    }
    await request.delete(`${API}/foods/${mince.id}`)
    await request.delete(`${API}/foods/${potato.id}`)
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
