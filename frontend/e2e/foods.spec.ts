import { expect, test } from '@nuxt/test-utils/playwright'
import { mockFoods } from './support/mock-api'

test('the Foods page shows the catalog from the API', async ({
  page,
  goto,
}) => {
  await mockFoods(page, [
    {
      id: 1,
      name: 'Oats',
      kind: 'raw',
      caloriesPer100g: 380,
      proteinPer100g: 13,
    },
    {
      id: 2,
      name: 'Skyr',
      kind: 'raw',
      caloriesPer100g: 64,
      proteinPer100g: 11,
    },
  ])

  await goto('/foods', { waitUntil: 'hydration' })

  await expect(page.getByRole('main')).toMatchAriaSnapshot(`
    - main:
      - heading "Foods" [level=1]
      - list:
        - listitem:
          - paragraph: Oats
          - paragraph: /380 kcal.*13 g protein/
        - listitem:
          - paragraph: Skyr
          - paragraph: /64 kcal.*11 g protein/
  `)
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
