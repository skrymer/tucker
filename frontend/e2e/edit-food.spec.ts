import { expect, test } from './support/test'
import { food, recipe } from '../test/food-fixtures'
import { foodCatalog } from '../test/mocks/handlers/catalog'

/** Rolled oats with protein mistyped as 31: 4 × 31 + 4 × 60 + 9 × 7 = 427 kcal. */
const oats = food({
  id: 1,
  name: 'Rolled oats',
  caloriesPer100g: 427,
  proteinPer100g: 31,
  carbsPer100g: 60,
  fatPer100g: 7,
  tags: [{ id: 7, name: 'breakfast' }],
})

/**
 * Fourteen Recipes weighing the oats in, each over a 400 g batch: the i-th
 * weighs in 20 × (i + 1) g, so 427 × grams / 400 kcal and 31 × grams / 400 g
 * protein /100g. Given out of order, so the panel's order is the server's.
 */
const OAT_RECIPES = [
  'Porridge',
  'Anzac biscuits',
  'Bircher muesli',
  'Smoothie',
  'Crumble',
  'Flapjacks',
  'Granola',
  'Granola bars',
  'Meatloaf',
  'Muffins',
  'Oat bread',
  'Oat pancakes',
  'Overnight oats',
  'Protein balls',
]
const oatRecipes = OAT_RECIPES.map((name, i) =>
  recipe({
    id: 100 + i,
    name,
    caloriesPer100g: (427 * 20 * (i + 1)) / 400,
    proteinPer100g: (31 * 20 * (i + 1)) / 400,
    cookedWeightG: 400,
    ingredientCount: 1,
  }),
)
const usedInFourteen = () =>
  foodCatalog({
    foods: [oats, ...oatRecipes],
    compositions: Object.fromEntries(
      oatRecipes.map((r, i) => [r.id, [{ foodId: 1, grams: 20 * (i + 1) }]]),
    ),
  })

test('the Edit sheet holds the Food’s name, macros, figures and Tags', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog({ foods: [oats] }))
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Edit Rolled oats' }).click()

  // One baseline per project: a phone opens a bottom sheet, a desktop a modal.
  await expect(
    page.getByRole('dialog', { name: 'Edit Rolled oats' }),
  ).toMatchAriaSnapshot()
})

test('a matched Food’s Edit sheet holds its match, with Change and Clear', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    ...foodCatalog({
      foods: [
        food({
          id: 3,
          name: 'Tasty cheese',
          caloriesPer100g: 397,
          proteinPer100g: 25,
          carbsPer100g: 0,
          fatPer100g: 33,
          referenceFoodId: 9,
          referenceFoodName: 'Cheese, cheddar, natural, regular fat',
        }),
      ],
    }),
  )
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Edit Tasty cheese' }).click()

  await expect(
    page.getByRole('dialog', { name: 'Edit Tasty cheese' }),
  ).toMatchAriaSnapshot()
})

test('the figures follow each keystroke while the field still has focus', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog({ foods: [oats] }))
  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Rolled oats' })
  const figures = sheet.getByRole('status')
  await expect(figures).toHaveText('427 kcal · 31 g protein /100g')

  const protein = sheet.getByRole('spinbutton', { name: /^Protein/ })
  await protein.selectText()
  await protein.pressSequentially('13')

  await expect(protein).toBeFocused()
  await expect(figures).toHaveText(
    'was 427 355 kcal · was 31 13 g protein /100g',
  )
  await expect(
    sheet.getByText(
      "Food you've already logged keeps the figures it was logged with.",
    ),
  ).toBeVisible()
})

test('saving the correction closes the sheet onto the corrected row', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog({ foods: [oats] }))
  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Rolled oats' })

  const protein = sheet.getByRole('spinbutton', { name: /^Protein/ })
  await protein.fill('13')
  // A number field commits on blur.
  await protein.press('Tab')
  await sheet.getByRole('button', { name: 'Save changes' }).click()

  await expect(sheet).toBeHidden()
  await expect(
    page.getByRole('main').getByText('355 kcal · 13 g protein /100g'),
  ).toBeVisible()
})

test('the Recipes a correction reaches open under the figures, alphabetically', async ({
  page,
  goto,
  network,
}) => {
  network.use(...usedInFourteen())
  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Rolled oats' })

  await sheet.getByRole('button', { name: 'Used in 14 recipes' }).click()

  await expect(sheet).toMatchAriaSnapshot()
})

test('a Food used in many Recipes scrolls them inside the panel, Save still in reach', async ({
  page,
  goto,
  network,
}) => {
  network.use(...usedInFourteen())
  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Rolled oats' })
  await sheet.getByRole('button', { name: 'Used in 14 recipes' }).click()

  const recipes = sheet.getByRole('list')
  await expect(recipes.getByRole('listitem')).toHaveCount(14)
  // The list holds fewer rows than it carries: the rest scroll inside it.
  expect(
    await recipes.evaluate((list) => list.scrollHeight > list.clientHeight),
  ).toBe(true)
  const save = sheet.getByRole('button', { name: 'Save changes' })
  await save.scrollIntoViewIfNeeded()
  await expect(save).toBeInViewport()
})

test('each Recipe’s figures follow each keystroke while the field still has focus', async ({
  page,
  goto,
  network,
}) => {
  network.use(...usedInFourteen())
  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Rolled oats' })
  await sheet.getByRole('button', { name: 'Used in 14 recipes' }).click()

  const protein = sheet.getByRole('spinbutton', { name: /^Protein/ })
  await protein.selectText()
  await protein.pressSequentially('13')

  // Oats corrected: 4 × 13 + 4 × 60 + 9 × 7 = 355 kcal /100g. Porridge weighs
  // in 20 g over 400 g: 427 → 355 × 20 / 400 = 21.35 → 17.75 kcal, and
  // 31 → 13 × 20 / 400 = 1.55 → 0.65 g protein.
  await expect(protein).toBeFocused()
  await expect(
    sheet.getByRole('button', { name: 'Also updates 14 recipes' }),
  ).toBeVisible()
  await expect(
    sheet.getByRole('listitem').filter({ hasText: 'Porridge' }),
  ).toHaveText(/^Porridge\s*was 21 18 kcal · was 2 1 g protein \/100g\s*$/)
})
