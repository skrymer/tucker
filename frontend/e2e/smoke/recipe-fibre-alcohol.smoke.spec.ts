import type { APIResponse } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { expectCreated } from './support/seeding'

// A Recipe rolls up its ingredients' fibre and alcohol, counting every gram of the
// wine's alcohol over the cooked weight (CONTEXT.md, Recipe; ADR 0040).
//   Wrap: 4 × 19.4 + 4 × 12.8 + 9 × 9.3 + 2 × 16.8 = 246.1 kcal /100g; 200 g = 492.2 kcal.
//   13% wine: 7 × 13 × 0.789 = 71.799 kcal /100g; 200 g = 143.598 kcal.
//   Cooked down to 300 g: 635.798 ÷ 300 × 100 = 211.9 kcal and 12.9 g protein /100g.
// Without the fibre the dish reads 190 kcal, and without the alcohol 164.
// No teardown: the auto `freshDatabase` fixture resets the DB before every smoke.
const API = 'http://localhost:8080/api'

test('a Recipe of a high-fibre wrap and wine previews and saves the calories both carry', async ({
  page,
  goto,
  request,
}) => {
  // Two ingredients picked and weighed one at a time against the real backend.
  test.slow()

  const createdId = async (pending: Promise<APIResponse>) => {
    await expectCreated(pending)
    return ((await (await pending).json()) as { id: number }).id
  }
  await createdId(
    request.post(`${API}/foods`, {
      data: {
        tagIds: [],
        name: 'Protein wrap',
        proteinPer100g: 19.4,
        carbsPer100g: 12.8,
        fatPer100g: 9.3,
        fibrePer100g: 16.8,
      },
    }),
  )
  await createdId(
    request.post(`${API}/foods`, {
      data: {
        tagIds: [],
        name: 'Shiraz',
        proteinPer100g: 0,
        carbsPer100g: 0,
        fatPer100g: 0,
        alcoholAbv: 13,
      },
    }),
  )

  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Add food' }).click()
  const addSheet = page.getByRole('dialog', { name: /add food/i })
  await expect(addSheet).toBeVisible()
  await addSheet.getByRole('tab', { name: 'Recipe' }).click()
  const sheet = page.getByRole('dialog', { name: /add recipe/i })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel(/recipe name/i).fill('Wrap bake')

  for (const ingredient of ['Protein wrap', 'Shiraz']) {
    await sheet.getByRole('button', { name: 'Add ingredient' }).click()
    await sheet.getByRole('button', { name: new RegExp(ingredient) }).click()
    await sheet.getByLabel('Grams').click()
    await page.keyboard.type('200')
    // Blur so the number field commits before the form validates on submit.
    await page.keyboard.press('Tab')
    await sheet.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(sheet.getByLabel(/cooked weight/i)).toBeVisible()
  }

  const cooked = sheet.getByLabel(/cooked weight/i)
  await cooked.click({ clickCount: 3 })
  await page.keyboard.type('300')
  await page.keyboard.press('Tab')

  const preview = sheet.getByRole('region', { name: /per 100 g/i })
  await expect(preview).toContainText('212 kcal')
  await expect(preview).toContainText('13 g protein')

  await sheet.getByRole('button', { name: /save recipe/i }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('212 kcal · 13 g protein /100g')).toBeVisible()
})
