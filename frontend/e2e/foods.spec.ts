import { expect, test } from './support/test'
import { mockFoods } from './support/mock-api'
import { food } from '../test/food-fixtures'

test('the Foods page shows the catalog from the API', async ({
  page,
  goto,
}) => {
  await mockFoods(page, [
    food({ id: 1, name: 'Oats', caloriesPer100g: 380, proteinPer100g: 13 }),
    food({ id: 2, name: 'Skyr', caloriesPer100g: 64, proteinPer100g: 11 }),
  ])

  await goto('/foods', { waitUntil: 'hydration' })

  // External aria-snapshot — Playwright stores one baseline per project
  // (Desktop Chrome / Mobile Chrome) under foods.spec.ts-snapshots/,
  // because the Add-food button is a header button on desktop and a
  // floating action button on phone. Closed-world, so it is also what
  // carries "no row logs a Food": a returning Log button is a diff.
  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})

test('the Foods page shows the empty state when the catalog is empty', async ({
  page,
  goto,
}) => {
  await mockFoods(page, [])

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
}) => {
  await mockFoods(page, [
    food({ id: 1, name: 'Free Range Eggs' }),
    food({ id: 2, name: 'rolled oats' }),
    food({ id: 3, name: 'LIGHT MILK' }),
    // Short words inside a shouted name are words, not initialisms — the row
    // that moves most, and the one a length rule alone gets wrong.
    food({ id: 4, name: 'LOW FAT MILK' }),
    // An initialism stands out against lower-case neighbours, so here it stays.
    food({ id: 5, name: 'UHT milk' }),
  ])

  await goto('/foods', { waitUntil: 'hydration' })

  const rows = page.getByRole('main').getByRole('listitem')
  await expect(rows.nth(0)).toContainText('Free range eggs')
  await expect(rows.nth(1)).toContainText('Rolled oats')
  await expect(rows.nth(2)).toContainText('Light milk')
  await expect(rows.nth(3)).toContainText('Low fat milk')
  await expect(rows.nth(4)).toContainText('UHT milk')
})
