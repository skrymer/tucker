import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F9 Slice 1 smoke: the full UI → API → DB path for creating a Recipe against
// the real backend, then logging it like any other Food. Seeds one ingredient
// Food, builds a Recipe through the Food|Recipe switch (pick → grams → cook-down
// → save), logs 250 g through the "log it now" continuation, and asserts Today's
// dashboard reflects it. Cleans up so the docker volume is unchanged between runs.
test('user builds a recipe, saves it, and logs a portion onto Today', async ({
  page,
  goto,
  request,
}) => {
  // Building a recipe step-by-step and logging it spans two SPA navigations and
  // many field interactions against the real backend — more than the default
  // 30 s budget on a cold route. Triple it.
  test.slow()

  const stamp = Date.now()
  const ingredientName = `Smoke chicken ${stamp}`
  const recipeName = `Smoke pie ${stamp}`

  // Ingredient is 4 × 25 = 100 kcal /100g. Weighing 800 g in and cooking the
  // dish down to 400 g doubles the density: 800 kcal ÷ 400 g × 100 = 200 kcal
  // /100g. Logging 250 g of the finished dish is then 200 × 2.5 = 500 kcal.
  const ingredientGrams = 800
  const cookedWeight = 400
  const portionGrams = 250
  const expectedKcal = 500

  const created = await request.post('http://localhost:8080/api/foods', {
    data: {
      name: ingredientName,
      proteinPer100g: 25,
      carbsPer100g: 0,
      fatPer100g: 0,
    },
  })
  expect(created.status()).toBe(201)
  const ingredient = (await created.json()) as { id: number }

  let entryId: number | undefined
  let recipeId: number | undefined
  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: 'Add food' }).click()
    const addSheet = page.getByRole('dialog', { name: /add food/i })
    await expect(addSheet).toBeVisible()

    // Switch from the Food builder to the Recipe builder.
    await addSheet.getByRole('tab', { name: 'Recipe' }).click()
    const sheet = page.getByRole('dialog', { name: /add recipe/i })
    await expect(sheet).toBeVisible()

    await sheet.getByLabel(/recipe name/i).fill(recipeName)

    // Add the ingredient one at a time: pick → grams → add.
    await sheet.getByRole('button', { name: 'Add ingredient' }).click()
    await sheet
      .getByRole('button', { name: new RegExp(ingredientName) })
      .click()
    await sheet.getByLabel('Grams').click()
    await page.keyboard.type(String(ingredientGrams))
    // Blur so the number field commits before the form validates on submit.
    await page.keyboard.press('Tab')
    await sheet.getByRole('button', { name: 'Add', exact: true }).click()

    // Back on the build step (the cooked-weight field only exists there): the
    // ingredient row shows its grams and calorie contribution (800 kcal).
    const cooked = sheet.getByLabel(/cooked weight/i)
    await expect(cooked).toBeVisible()
    await expect(
      sheet.getByRole('button', { name: new RegExp(`${ingredientName}.*800`) }),
    ).toBeVisible()

    // Cook it down: replace the raw-sum default with the finished scale weight.
    await cooked.click({ clickCount: 3 })
    await page.keyboard.type(String(cookedWeight))
    // Blur so the number field commits before the preview is read.
    await page.keyboard.press('Tab')

    // The live Per 100 g result reflects the cook-down (200 kcal /100g).
    const result = sheet.getByRole('region', { name: /per 100 g/i })
    await expect(result.getByText(/200 kcal/)).toBeVisible()

    await sheet.getByRole('button', { name: /save recipe/i }).click()

    // Saved → the flow pivots to "log it now" (the recipe is a Food too).
    await expect(
      sheet.getByRole('button', { name: /log it now/i }),
    ).toBeVisible()
    await sheet.getByLabel('Grams').click()
    await page.keyboard.type(String(portionGrams))
    await page.keyboard.press('Tab')
    await sheet.getByRole('button', { name: /log it now/i }).click()
    await expect(sheet).toBeHidden()

    // The portion lands on Today's dashboard.
    await goto('/', { waitUntil: 'hydration' })
    await expect(
      page.getByText(`${recipeName} — ${expectedKcal} kcal`),
    ).toBeVisible()

    // The saved recipe is in the catalog as a Food.
    const foodsList = await request.get('http://localhost:8080/api/foods')
    const foods = (await foodsList.json()) as Array<{
      id: number
      name: string
      kind: string
    }>
    const recipe = foods.find((f) => f.name === recipeName)
    expect(recipe, 'saved recipe should appear in GET /api/foods').toBeDefined()
    expect(recipe!.kind).toBe('RECIPE')
    recipeId = recipe!.id

    // Capture the logged entry for cleanup.
    const entriesList = await request.get('http://localhost:8080/api/entries', {
      params: { date: todayIso() },
    })
    const entries = (await entriesList.json()) as Array<{
      id: number
      foodName?: string
    }>
    const entry = entries.find((e) => e.foodName === recipeName)
    expect(
      entry,
      'logged recipe portion should be in GET /api/entries',
    ).toBeDefined()
    entryId = entry!.id
  } finally {
    // Order matters: an Entry pins its Food, and a Recipe's cascade frees its
    // ingredient. Entry → Recipe (cascades its ingredient lines) → ingredient.
    if (entryId !== undefined) {
      await request.delete(`http://localhost:8080/api/entries/${entryId}`)
    }
    if (recipeId !== undefined) {
      await request.delete(`http://localhost:8080/api/foods/${recipeId}`)
    }
    await request.delete(`http://localhost:8080/api/foods/${ingredient.id}`)
  }
})
