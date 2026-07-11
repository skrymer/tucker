import { expect, test } from './support/test'
import { mockFoods } from './support/mock-api'

// F9 Slice 2: the catalog distinction + read-only composition view with /api
// mocked, on both Desktop and Mobile Chrome (the responsive check). A recipe row
// wears a Recipe chip + "N ingredients · makes X g"; a plain Food row is
// unchanged; the row's view button opens the read-only composition.
test('a recipe reads as a recipe in the catalog and opens its composition', async ({
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
      cookedWeightG: 1400,
      ingredientCount: 2,
    },
  ])

  // The composition detail fetch (GET /api/recipes/{id}) — distinct from the
  // catalog's GET /api/foods, which mockFoods stubs.
  await page.route('**/api/recipes/*', (route) =>
    route.fulfill({
      json: {
        id: 2,
        name: 'Cottage pie',
        cookedWeightG: 1400,
        ingredients: [
          { foodId: 1, name: 'Beef mince', grams: 500 },
          { foodId: 3, name: 'Potato', grams: 900 },
        ],
      },
    }),
  )

  await goto('/foods', { waitUntil: 'hydration' })

  // The recipe row wears the chip and the "N ingredients · makes X g" subline.
  const recipeRow = page
    .getByRole('listitem')
    .filter({ hasText: 'Cottage pie' })
  await expect(recipeRow.getByText('Recipe')).toBeVisible()
  await expect(
    recipeRow.getByText(/2 ingredients · makes 1,400 g/),
  ).toBeVisible()

  // A plain Food row is unchanged: no chip, no view button.
  const foodRow = page.getByRole('listitem').filter({ hasText: 'Chicken' })
  await expect(foodRow.getByText('Recipe')).toHaveCount(0)
  await expect(
    foodRow.getByRole('button', { name: /view ingredients/i }),
  ).toHaveCount(0)

  // The view button opens the read-only composition.
  await recipeRow
    .getByRole('button', { name: 'View ingredients in Cottage pie' })
    .click()

  const sheet = page.getByRole('dialog', { name: /cottage pie/i })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Beef mince')).toBeVisible()
  await expect(sheet.getByText('500 g')).toBeVisible()
  await expect(sheet.getByText('Potato')).toBeVisible()
  await expect(sheet.getByText('900 g')).toBeVisible()
  await expect(sheet.getByText(/makes/i)).toBeVisible()
  await expect(sheet.getByText('1,400 g')).toBeVisible()
})
