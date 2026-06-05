import { test, expect } from './support/smoke-test'

// F3 Slice 3 smoke: deletes a food through the UI against the real
// backend. Seeds a uniquely-named food, opens its row, confirms the
// delete, and asserts the row is gone from the list (and the catalog).
test('user deletes a food from the catalog', async ({
  page,
  goto,
  request,
}) => {
  const foodName = `Smoke deleted ${Date.now()}`

  const created = await request.post('http://localhost:8080/api/foods', {
    data: {
      name: foodName,
      proteinPer100g: 1,
      carbsPer100g: 1,
      fatPer100g: 1,
    },
  })
  expect(created.status()).toBe(201)
  let createdId: number | undefined = ((await created.json()) as { id: number })
    .id

  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await expect(page.getByText(foodName)).toBeVisible()

    await page.getByRole('button', { name: new RegExp(foodName) }).click()

    const dialog = page.getByRole('dialog', { name: /delete this food/i })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: /^delete$/i }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText(foodName)).toBeHidden()

    const list = await request.get('http://localhost:8080/api/foods')
    const foods = (await list.json()) as Array<{ name: string }>
    expect(foods.find((f) => f.name === foodName)).toBeUndefined()

    createdId = undefined // deleted through UI; nothing to clean up
  } finally {
    if (createdId !== undefined) {
      await request.delete(`http://localhost:8080/api/foods/${createdId}`)
    }
  }
})
