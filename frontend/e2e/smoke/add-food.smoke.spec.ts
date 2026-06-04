import { test, expect } from '@nuxt/test-utils/playwright'

// F3 Slice 2 smoke: adds a food through the UI against the real backend.
// The user enters name + macros; the backend derives calories from
// 4P + 4C + 9F and the new row appears in the Foods list with that
// computed value.
test('user adds a food and sees it in the catalog', async ({
  page,
  goto,
  request,
}) => {
  const foodName = `Smoke added ${Date.now()}`
  // 4 * 10 + 4 * 20 + 9 * 5 = 165 kcal /100g
  const protein = 10
  const carbs = 20
  const fat = 5
  const expectedKcal = 165

  let createdId: number | undefined
  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: 'Add food' }).click()
    const sheet = page.getByRole('dialog', { name: /add food/i })
    await expect(sheet).toBeVisible()

    await sheet.getByLabel(/^name$/i).fill(foodName)
    // UInputNumber's underlying NumberField doesn't pick up .fill()
    // reliably — type into the focused input instead (same workaround
    // as the Weighed smoke).
    await sheet.getByLabel(/protein \/100\s*g/i).click()
    await page.keyboard.type(String(protein))
    await sheet.getByLabel(/carbs \/100\s*g/i).click()
    await page.keyboard.type(String(carbs))
    await sheet.getByLabel(/fat \/100\s*g/i).click()
    await page.keyboard.type(String(fat))

    await sheet.getByRole('button', { name: /save food/i }).click()

    // Saved → the flow offers to log it now (issue #52). This smoke only covers
    // adding to the catalog, so decline; the continuation has its own smoke.
    await expect(
      sheet.getByRole('button', { name: /log it now/i }),
    ).toBeVisible()
    await sheet.getByRole('button', { name: /not now/i }).click()

    await expect(sheet).toBeHidden()
    await expect(page.getByText(foodName)).toBeVisible()
    await expect(
      page.getByText(`${expectedKcal} kcal · ${protein} g protein /100g`),
    ).toBeVisible()

    // Capture id for cleanup.
    const list = await request.get('http://localhost:8080/api/foods')
    const foods = (await list.json()) as Array<{ id: number; name: string }>
    const created = foods.find((f) => f.name === foodName)
    expect(created, 'created food should be in GET /api/foods').toBeDefined()
    createdId = created!.id
  } finally {
    if (createdId !== undefined) {
      await request.delete(`http://localhost:8080/api/foods/${createdId}`)
    }
  }
})
