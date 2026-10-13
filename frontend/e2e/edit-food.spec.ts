import { expect, test } from './support/test'
import { food } from '../test/food-fixtures'
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
