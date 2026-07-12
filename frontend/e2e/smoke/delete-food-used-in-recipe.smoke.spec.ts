import { test, expect } from './support/smoke-test'

const API = 'http://localhost:8080/api'

// This smoke deliberately triggers the domain rejection: the DELETE comes back
// 400, which the browser logs as a failed resource load. Everything else stays
// strict.
test.use({
  allowedErrors: [
    /Failed to load resource: the server responded with a status of 400/,
  ],
})

// F9 Slice 4: a Food used as an ingredient of a Recipe is part of that recipe's
// definition and cannot be deleted. Seeds an ingredient Food, composes a Recipe
// from it via the API, then attempts the delete through the UI — the rule's
// message names the Recipe and the Food stays in the catalog. Cleanup deletes
// the Recipe first (its ingredient line cascades away), which frees the
// now-unreferenced ingredient Food to be removed.
test('a food used as a recipe ingredient cannot be deleted from the catalog', async ({
  page,
  goto,
  request,
}) => {
  const stamp = Date.now()
  const ingredientName = `Smoke mince ${stamp}`
  const recipeName = `Smoke pie ${stamp}`

  const created = await request.post(`${API}/foods`, {
    data: {
      name: ingredientName,
      proteinPer100g: 20,
      carbsPer100g: 0,
      fatPer100g: 10,
    },
  })
  expect(created.status()).toBe(201)
  const ingredientId = ((await created.json()) as { id: number }).id

  const recipeCreated = await request.post(`${API}/recipes`, {
    data: {
      name: recipeName,
      cookedWeightG: 200,
      ingredients: [{ foodId: ingredientId, grams: 300 }],
    },
  })
  expect(recipeCreated.status()).toBe(201)
  const recipeId = ((await recipeCreated.json()) as { id: number }).id

  try {
    await goto('/foods', { waitUntil: 'hydration' })
    await expect(
      page.getByRole('button', { name: `Log ${ingredientName}` }),
    ).toBeVisible()

    await page.getByRole('button', { name: `Delete ${ingredientName}` }).click()
    const dialog = page.getByRole('dialog', { name: /delete this food/i })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^delete$/i }).click()

    // The rule's message names the blocking Recipe, the confirm closes, and the
    // ingredient Food remains in the catalog — no pointless Retry (retrying
    // never succeeds). Exact match targets the visible toast description, not the
    // assertive aria-live mirror that also carries the text.
    await expect(
      page.getByText(
        `${ingredientName} is an ingredient of ${recipeName} and can't be deleted.`,
        { exact: true },
      ),
    ).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('button', { name: `Log ${ingredientName}` }),
    ).toBeVisible()

    // Still in the catalog server-side.
    const list = await request.get(`${API}/foods`)
    const foods = (await list.json()) as Array<{ name: string }>
    expect(foods.find((f) => f.name === ingredientName)).toBeDefined()
  } finally {
    // Delete the Recipe first — its ingredient line cascades away — then the
    // now-unreferenced ingredient Food deletes cleanly (204).
    await request.delete(`${API}/foods/${recipeId}`)
    const deleted = await request.delete(`${API}/foods/${ingredientId}`)
    expect(deleted.status()).toBe(204)
  }
})
