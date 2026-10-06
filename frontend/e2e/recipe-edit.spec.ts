import { expect, test } from './support/test'
import { food, recipe } from '../test/food-fixtures'
import { foodCatalog } from '../test/mocks/handlers/catalog'

// F9 Slice 3: editing a recipe from its composition view, with /api mocked, on
// both Desktop and Mobile Chrome (the responsive check). Open the recipe's
// composition → Edit → the same builder, pre-filled → recalibrate the cooked
// weight → Save closes the sheet onto the catalog, which lists the Recipe at
// its new density.
test('recalibrates a recipe from its composition view via the pre-filled builder', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    ...foodCatalog({
      foods: [
        food({
          id: 1,
          name: 'Beef mince',
          caloriesPer100g: 170,
          proteinPer100g: 20,
        }),
        recipe({
          id: 2,
          name: 'Cottage pie',
          caloriesPer100g: 255,
          proteinPer100g: 30,
          cookedWeightG: 200,
          ingredientCount: 1,
        }),
      ],
      compositions: { 2: [{ foodId: 1, grams: 300 }] },
    }),
  )

  await goto('/foods', { waitUntil: 'hydration' })

  const recipeRow = page
    .getByRole('listitem')
    .filter({ hasText: 'Cottage pie' })
  await expect(
    recipeRow.getByText('255 kcal · 30 g protein /100g'),
  ).toBeVisible()

  // Open the read-only composition, then switch it to the edit builder.
  await recipeRow
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

  // The sheet closes onto the re-read catalog: the same 510 kcal and 60 g of
  // protein, now over 100 g of finished dish, doubles the density.
  await expect(sheet).toBeHidden()
  await expect(recipeRow.getByText('1 ingredient · makes 100 g')).toBeVisible()
  await expect(
    recipeRow.getByText('510 kcal · 60 g protein /100g'),
  ).toBeVisible()
})
