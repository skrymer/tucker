import { test, expect } from './support/smoke-test'

// A Food's fibre counts at 2 kcal a gram (ADR 0040): the protein wrap, typed
// off its label, reads the label's 246 kcal — 4 × 19.4 + 4 × 12.8 + 9 × 9.3 +
// 2 × 16.8 = 246.1 — where the three macros alone would read 213.
test('a Food created with its label’s fibre reads the label’s calories', async ({
  page,
  goto,
  request,
}) => {
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Add food' }).click()
  const sheet = page.getByRole('dialog', { name: /add food/i })
  await expect(sheet).toBeVisible()

  await sheet.getByLabel(/^name$/i).fill('Protein wrap')
  // UInputNumber commits what is typed into it, not what .fill() sets.
  for (const [label, figure] of [
    [/protein \/100\s*g/i, '19.4'],
    [/carbs \/100\s*g/i, '12.8'],
    [/fat \/100\s*g/i, '9.3'],
    [/fibre \/100\s*g/i, '16.8'],
  ] as const) {
    await sheet.getByLabel(label).click()
    await page.keyboard.type(figure)
  }
  await sheet.getByRole('button', { name: /save food/i }).click()

  await expect(sheet).toBeHidden()
  await expect(page.getByText('246 kcal · 19 g protein /100g')).toBeVisible()

  // Stored, not only answered: a fresh read of the catalog carries the fibre.
  const foods = (await (
    await request.get('http://localhost:8080/api/foods')
  ).json()) as Array<{ name: string; fibrePer100g: number | null }>
  expect(foods.find((f) => f.name === 'Protein wrap')?.fibrePer100g).toBe(16.8)
})
