import { expect, test } from './support/test'
import { sampleDialogText } from './support/dialog'
import { food, recipe } from '../test/food-fixtures'
import { foodCatalog } from '../test/mocks/handlers/catalog'
import { catalogOf } from '../test/mocks/handlers/foods'

test('the Foods page shows the catalog from the API', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    catalogOf([
      food({ id: 1, name: 'Oats', caloriesPer100g: 380, proteinPer100g: 13 }),
      food({ id: 2, name: 'Skyr', caloriesPer100g: 64, proteinPer100g: 11 }),
    ]),
  )

  await goto('/foods', { waitUntil: 'hydration' })

  // External aria-snapshot — Playwright stores one baseline per project
  // (Desktop Chrome / Mobile Chrome) under foods.spec.ts-snapshots/,
  // because the Add-food button is a header button on desktop and a
  // floating action button on phone. Closed-world, so it is also what
  // carries "no row logs a Food": a returning Log button is a diff.
  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})

test('keeps naming the Food while its delete confirm closes', async ({
  page,
  goto,
  network,
}) => {
  network.use(catalogOf([food({ id: 1, name: 'rolled oats' })]))

  await goto('/foods', { waitUntil: 'hydration' })
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Delete Rolled oats' })
    .click()
  const confirm = page.getByRole('dialog', { name: 'Delete this food?' })
  await expect(confirm).toBeVisible()
  const seen = await sampleDialogText(page)
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()

  const frames = await seen()
  expect(frames.length).toBeGreaterThan(1)
  expect(
    frames.filter((text) => !text.includes('Rolled oats will be removed')),
  ).toEqual([])
})

test('the Foods page shows the empty state when the catalog is empty', async ({
  page,
  goto,
}) => {
  // The baseline's catalog is empty.
  await goto('/foods', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: /build your food catalog/i }),
  ).toBeVisible()
  // The toast region also renders a list — scope to <main>.
  await expect(page.getByRole('main').getByRole('list')).toHaveCount(0)
})

test('the catalog states every name in one voice, however each was typed', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    catalogOf([
      food({ id: 1, name: 'Free Range Eggs' }),
      food({ id: 2, name: 'rolled oats' }),
      food({ id: 3, name: 'LIGHT MILK' }),
      // Short words inside a shouted name are words, not initialisms — the row
      // that moves most, and the one a length rule alone gets wrong.
      food({ id: 4, name: 'LOW FAT MILK' }),
      // An initialism stands out against lower-case neighbours, so here it stays.
      food({ id: 5, name: 'UHT milk' }),
    ]),
  )

  await goto('/foods', { waitUntil: 'hydration' })

  // Listed as the server lists them: by name, ignoring case.
  const rows = page.getByRole('main').getByRole('listitem')
  await expect(rows.nth(0)).toContainText('Free range eggs')
  await expect(rows.nth(1)).toContainText('Light milk')
  await expect(rows.nth(2)).toContainText('Low fat milk')
  await expect(rows.nth(3)).toContainText('Rolled oats')
  await expect(rows.nth(4)).toContainText('UHT milk')
})

test('every row offers one Edit: a plain, a matched and a Recipe row', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    ...foodCatalog({
      foods: [
        recipe({
          id: 1,
          name: 'Cottage pie',
          caloriesPer100g: 120,
          proteinPer100g: 9,
          cookedWeightG: 1400,
          ingredientCount: 5,
        }),
        food({ id: 2, name: 'Skyr', caloriesPer100g: 64, proteinPer100g: 11 }),
        food({
          id: 3,
          name: 'Tasty cheese',
          caloriesPer100g: 397,
          proteinPer100g: 25,
          referenceFoodId: 9,
          referenceFoodName: 'Cheese, cheddar, natural, regular fat',
        }),
      ],
    }),
  )

  await goto('/foods', { waitUntil: 'hydration' })

  // A plain Food is Edit · Delete, matched or not — its match is changed in
  // the Edit sheet — and a Recipe adds its read-only View ingredients.
  await expect(page.getByRole('main').getByRole('list')).toMatchAriaSnapshot()
})
