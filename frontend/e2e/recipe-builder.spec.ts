import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { food } from '../test/food-fixtures'
import { foodCatalog } from '../test/mocks/handlers/catalog'

const chicken = food({
  id: 1,
  name: 'Chicken',
  caloriesPer100g: 100,
  proteinPer100g: 25,
})

/**
 * Open the Add sheet on the Recipe tab. `builder` is the Recipe tab panel: the
 * Food tab stays mounted behind it and carries its own name and macro fields, so
 * a query scoped to the sheet alone can match either.
 */
async function openRecipeBuilder(page: Page) {
  await page.getByRole('button', { name: 'Add food' }).click()
  await page
    .getByRole('dialog', { name: /add food/i })
    .getByRole('tab', { name: 'Recipe' })
    .click()
  const sheet = page.getByRole('dialog', { name: /add recipe/i })
  return { sheet, builder: sheet.getByRole('tabpanel', { name: 'Recipe' }) }
}

// F9 Slice 1: the recipe builder happy path with /api mocked, on both Desktop
// and Mobile Chrome (the responsive check). Drives the Food|Recipe switch, the
// one-ingredient-at-a-time step machine, the cook-down, and the save — asserting
// that the sheet closes onto the catalog, which lists the Recipe as saved.
test('user builds and saves a recipe through the Food or Recipe switch', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog({ foods: [chicken] }))

  await goto('/foods', { waitUntil: 'hydration' })

  const { sheet, builder } = await openRecipeBuilder(page)
  await builder.getByLabel(/recipe name/i).fill('Cottage pie')

  // Add one ingredient: pick → grams → add.
  await builder.getByRole('button', { name: 'Add ingredient' }).click()
  await builder.getByRole('button', { name: /chicken/i }).click()
  await builder.getByLabel('Grams').click()
  await page.keyboard.type('800')
  // Blur so the number field commits before the form validates on submit.
  await page.keyboard.press('Tab')
  await builder.getByRole('button', { name: 'Add', exact: true }).click()

  // Cook it down from the 800 g raw sum to a 400 g finished dish.
  const cooked = builder.getByLabel(/cooked weight/i)
  await cooked.click({ clickCount: 3 })
  await page.keyboard.type('400')
  await page.keyboard.press('Tab')

  // The live preview reflects the cook-down: 800 kcal ÷ 400 g × 100 = 200.
  await expect(
    builder.getByRole('region', { name: /per 100 g/i }).getByText(/200 kcal/),
  ).toBeVisible()

  await builder.getByRole('button', { name: /save recipe/i }).click()

  // A saved Recipe is a Food, and the catalog is only a catalog (ADR 0028): the
  // sheet closes onto it rather than pivoting into a second way to log.
  await expect(sheet).toBeHidden()

  // The re-read catalog lists the Recipe the server rolled up from the 800 g of
  // Chicken weighed in: 800 kcal and 200 g of protein over 400 g cooked.
  const recipeRow = page
    .getByRole('listitem')
    .filter({ hasText: 'Cottage pie' })
  await expect(recipeRow.getByText('1 ingredient · makes 400 g')).toBeVisible()
  await expect(
    recipeRow.getByText('200 kcal · 50 g protein /100g'),
  ).toBeVisible()
})

// F9 #142: the recipe builder's inline "Add a new food". The page owns catalog
// mutations, so the builder emits and `/foods` persists — then hands the Food
// back down for the builder to select. Here rather than in a component test
// because what is unpinned is the *page's* half — the POST and the re-read —
// which ADR 0013 calls thin glue and covers with the integrated test.
// `RecipeBuilder.test.ts` already pins its side, so this asserts only the two
// page-level facts and stops.
test('user adds a new food inline and it arrives selected as the ingredient', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog({ foods: [chicken] }))

  await goto('/foods', { waitUntil: 'hydration' })

  const { sheet, builder } = await openRecipeBuilder(page)
  await builder.getByLabel(/recipe name/i).fill('Cottage pie')

  // Into the picker, then off it: the food being weighed in isn't in the catalog
  // yet, and leaving the sheet to go and add it would lose the half-built recipe.
  await builder.getByRole('button', { name: 'Add ingredient' }).click()
  await builder.getByRole('button', { name: 'Add a new food' }).click()

  await builder.getByLabel('Name', { exact: true }).fill('Peas')
  for (const [label, value] of [
    ['Protein /100g', '5'],
    ['Carbs /100g', '10'],
    ['Fat /100g', '1'],
  ] as const) {
    await builder.getByLabel(label).click()
    await page.keyboard.type(value)
    // A number field commits its model on blur.
    await page.keyboard.press('Tab')
  }
  await builder.getByRole('button', { name: 'Save food' }).click()

  // The page persisted it and handed it back: the builder is on the grams step
  // with the new Food already picked, not back at the picker.
  await expect(builder.getByLabel('Grams')).toBeVisible()
  await expect(builder.getByText('Peas', { exact: true })).toBeVisible()

  // The page re-read the catalog on the way through, so the Food it persisted is
  // in it — the builder is not the only place it exists — with the calories the
  // server derives from the macros it was sent: 4 × 5 + 4 × 10 + 9 × 1 = 69.
  await sheet.getByRole('button', { name: /close/i }).click()
  await expect(sheet).toBeHidden()
  const peasRow = page.getByRole('listitem').filter({ hasText: 'Peas' })
  await expect(peasRow.getByText('69 kcal · 5 g protein /100g')).toBeVisible()
})
