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
  // floating action button on phone.
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
