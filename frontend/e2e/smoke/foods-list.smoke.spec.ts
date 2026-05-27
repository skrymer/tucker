import { test, expect } from '@nuxt/test-utils/playwright'

// F3 Slice 1 smoke: the Foods page reads the live catalog and renders
// it. Seeds a uniquely-named food via the API, asserts the row shows
// on /foods, cleans up.
test('the Foods page lists foods from the real backend', async ({
  page,
  goto,
  request,
}) => {
  const foodName = `Smoke listed food ${Date.now()}`
  const caloriesPer100g = 250
  const proteinPer100g = 20

  const created = await request.post('http://localhost:8080/api/foods', {
    data: { name: foodName, caloriesPer100g, proteinPer100g },
  })
  expect(created.status()).toBe(201)
  const food = (await created.json()) as { id: number; name: string }

  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await expect(
      page.getByRole('heading', { name: 'Foods', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText(foodName)).toBeVisible()
    await expect(
      page.getByText(
        `${caloriesPer100g} kcal · ${proteinPer100g} g protein /100g`,
      ),
    ).toBeVisible()
  } finally {
    await request.delete(`http://localhost:8080/api/foods/${food.id}`)
  }
})
