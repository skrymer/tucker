import { expect, test } from './support/test'
import { mockFoods } from './support/mock-api'

// F9 Slice 1: the recipe builder happy path with /api mocked, on both Desktop
// and Mobile Chrome (the responsive check). Drives the Food|Recipe switch, the
// one-ingredient-at-a-time step machine, the cook-down, and the save — asserting
// the POST body the backend receives and the pivot to "log it now".
test('user builds and saves a recipe through the Food or Recipe switch', async ({
  page,
  goto,
}) => {
  await mockFoods(page, [
    {
      id: 1,
      name: 'Chicken',
      kind: 'FOOD',
      caloriesPer100g: 100,
      proteinPer100g: 25,
      carbsPer100g: 0,
      fatPer100g: 0,
      cookedWeightG: null,
    },
  ])

  let recipeBody: unknown
  await page.route('**/api/recipes', async (route) => {
    recipeBody = route.request().postDataJSON()
    await route.fulfill({
      status: 201,
      json: {
        id: 50,
        name: 'Cottage pie',
        kind: 'RECIPE',
        caloriesPer100g: 200,
        proteinPer100g: 50,
        carbsPer100g: null,
        fatPer100g: null,
        cookedWeightG: 400,
      },
    })
  })

  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Add food' }).click()
  const addSheet = page.getByRole('dialog', { name: /add food/i })
  await addSheet.getByRole('tab', { name: 'Recipe' }).click()

  const sheet = page.getByRole('dialog', { name: /add recipe/i })
  await sheet.getByLabel(/recipe name/i).fill('Cottage pie')

  // Add one ingredient: pick → grams → add.
  await sheet.getByRole('button', { name: 'Add ingredient' }).click()
  await sheet.getByRole('button', { name: /chicken/i }).click()
  await sheet.getByLabel('Grams').click()
  await page.keyboard.type('800')
  // Blur so the number field commits before the form validates on submit.
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()

  // Cook it down from the 800 g raw sum to a 400 g finished dish.
  const cooked = sheet.getByLabel(/cooked weight/i)
  await cooked.click({ clickCount: 3 })
  await page.keyboard.type('400')
  await page.keyboard.press('Tab')

  // The live preview reflects the cook-down: 800 kcal ÷ 400 g × 100 = 200.
  await expect(
    sheet.getByRole('region', { name: /per 100 g/i }).getByText(/200 kcal/),
  ).toBeVisible()

  await sheet.getByRole('button', { name: /save recipe/i }).click()

  // The saved recipe is a Food, so the flow pivots to "log it now".
  await expect(sheet.getByRole('button', { name: /log it now/i })).toBeVisible()

  expect(recipeBody).toEqual({
    name: 'Cottage pie',
    cookedWeightG: 400,
    ingredients: [{ foodId: 1, grams: 800 }],
  })
})
