import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F19 slice 1 smoke: a Food used in a Recipe and logged today is corrected from
// its Edit sheet against the real backend. A correction says the old values
// were never true (ADR 0037), so the Recipe is re-rolled in the same save and
// its row moves, while today's Entry keeps the figures it snapshotted — and,
// since an Entry never snapshotted the name, reads under the corrected one. The
// per-test reset wipes the seed, so there is no cleanup.
const API = 'http://localhost:8080/api'

test('correcting a Food moves the Recipe it is in, and leaves what was logged with its figures', async ({
  page,
  goto,
  request,
}) => {
  // Protein mistyped as 31: 4 × 31 + 9 × 10 = 214 kcal /100g.
  const created = await request.post(`${API}/foods`, {
    data: {
      tagIds: [],
      name: 'Mince',
      proteinPer100g: 31,
      carbsPer100g: 0,
      fatPer100g: 10,
    },
  })
  expect(created.status()).toBe(201)
  const mince = ((await created.json()) as { id: number }).id
  // 300 g of it over a 300 g dish: the Recipe is the mince, per 100 g.
  const stew = await request.post(`${API}/recipes`, {
    data: {
      tagIds: [],
      name: 'Stew',
      cookedWeightG: 300,
      ingredients: [{ foodId: mince, grams: 300 }],
    },
  })
  expect(stew.status()).toBe(201)
  const logged = await request.post(`${API}/entries/weighed`, {
    data: { date: todayIso(), foodId: mince, grams: 100 },
  })
  expect(logged.status()).toBe(201)

  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Mince' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Mince' })
  const name = sheet.getByRole('textbox', { name: /^Name/ })
  await name.fill('Beef mince')
  const protein = sheet.getByRole('spinbutton', { name: /^Protein/ })
  await protein.fill('13')
  // A number field commits on blur.
  await protein.press('Tab')
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(sheet).toBeHidden()

  // 4 × 13 + 9 × 10 = 142 kcal /100g, for the Food and the Recipe alike.
  const catalog = page.getByRole('main').getByRole('list').first()
  await expect(catalog.getByRole('listitem')).toHaveText([
    /^Beef mince\s*142 kcal · 13 g protein \/100g$/,
    /^Stew\s*Recipe\s*142 kcal · 13 g protein \/100g/,
  ])

  await goto('/', { waitUntil: 'hydration' })
  await expect(
    page.getByRole('main').getByText('Beef mince', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('main').getByText('100 g · 214 kcal · 31 g protein'),
  ).toBeVisible()
})
