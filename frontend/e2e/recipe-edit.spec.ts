import { expect, test } from './support/test'
import { mockFoods } from './support/mock-api'

// F9 Slice 3: editing a recipe from its composition view, with /api mocked, on
// both Desktop and Mobile Chrome (the responsive check). Open the recipe's
// composition → Edit → the same builder, pre-filled → recalibrate the cooked
// weight → Save issues a PUT with the new cooked weight and closes the sheet.
test('recalibrates a recipe from its composition view via the pre-filled builder', async ({
  page,
  goto,
}) => {
  await mockFoods(page, [
    {
      id: 1,
      name: 'Beef mince',
      kind: 'FOOD',
      caloriesPer100g: 170,
      proteinPer100g: 20,
      carbsPer100g: 0,
      fatPer100g: 0,
      cookedWeightG: null,
      ingredientCount: null,
    },
    {
      id: 2,
      name: 'Cottage pie',
      kind: 'RECIPE',
      caloriesPer100g: 255,
      proteinPer100g: 30,
      carbsPer100g: null,
      fatPer100g: null,
      cookedWeightG: 200,
      ingredientCount: 1,
    },
  ])

  let putBody: { name?: string; cookedWeightG?: number } | null = null
  await page.route('**/api/recipes/*', (route) => {
    const request = route.request()
    if (request.method() === 'PUT') {
      putBody = request.postDataJSON()
      // The recalibrated recipe: cooking down to 100 g doubles the density.
      return route.fulfill({
        json: {
          id: 2,
          name: 'Cottage pie',
          kind: 'RECIPE',
          barcode: null,
          caloriesPer100g: 510,
          proteinPer100g: 60,
          carbsPer100g: null,
          fatPer100g: null,
          cookedWeightG: 100,
          ingredientCount: 1,
        },
      })
    }
    // GET: the composition the edit form is seeded from.
    return route.fulfill({
      json: {
        id: 2,
        name: 'Cottage pie',
        cookedWeightG: 200,
        ingredients: [{ foodId: 1, name: 'Beef mince', grams: 300 }],
      },
    })
  })

  await goto('/foods', { waitUntil: 'hydration' })

  // Open the read-only composition, then switch it to the edit builder.
  await page
    .getByRole('button', { name: 'View ingredients in Cottage pie' })
    .click()
  const sheet = page.getByRole('dialog', { name: /cottage pie/i })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: /edit recipe/i }).click()

  // The builder is pre-filled: the ingredient line and the recorded cooked weight.
  await expect(
    sheet.getByRole('button', { name: /beef mince.*300/i }),
  ).toBeVisible()
  const cooked = sheet.getByLabel(/cooked weight/i)
  await expect(cooked).toHaveValue('200')

  // Recalibrate: cook it down to 100 g. Blur so the number field commits.
  await cooked.click({ clickCount: 3 })
  await page.keyboard.type('100')
  await page.keyboard.press('Tab')

  await sheet.getByRole('button', { name: /save changes/i }).click()

  // The save issues a PUT with the recalibrated cooked weight, then closes.
  await expect(sheet).toBeHidden()
  expect(putBody).not.toBeNull()
  expect(putBody!.cookedWeightG).toBe(100)
  expect(putBody!.name).toBe('Cottage pie')
})
