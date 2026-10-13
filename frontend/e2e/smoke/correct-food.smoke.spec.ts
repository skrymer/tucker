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

test('the Edit sheet lists the real Recipes a correction reaches, before → after as the catalog then shows them', async ({
  page,
  goto,
  request,
}) => {
  const createFood = async (
    name: string,
    protein: number,
    carbs: number,
    fat: number,
  ) => {
    const created = await request.post(`${API}/foods`, {
      data: {
        tagIds: [],
        name,
        proteinPer100g: protein,
        carbsPer100g: carbs,
        fatPer100g: fat,
      },
    })
    expect(created.status()).toBe(201)
    return ((await created.json()) as { id: number }).id
  }
  const createRecipe = async (
    name: string,
    cookedWeightG: number,
    ingredients: { foodId: number; grams: number }[],
  ) => {
    const created = await request.post(`${API}/recipes`, {
      data: { tagIds: [], name, cookedWeightG, ingredients },
    })
    expect(created.status()).toBe(201)
  }
  // Protein mistyped as 31: 4 × 31 + 9 × 10 = 214 kcal /100g; onion 40 kcal.
  const mince = await createFood('Mince', 31, 0, 10)
  const onion = await createFood('Onion', 1, 9, 0)
  await createRecipe('Stew', 200, [
    { foodId: mince, grams: 300 },
    { foodId: onion, grams: 100 },
  ])
  await createRecipe('Cottage pie', 400, [{ foodId: mince, grams: 400 }])

  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Mince' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Mince' })
  await sheet.getByRole('button', { name: 'Used in 2 recipes' }).click()
  const protein = sheet.getByRole('spinbutton', { name: /^Protein/ })
  await protein.selectText()
  await protein.pressSequentially('13')

  // Mince corrected: 4 × 13 + 9 × 10 = 142 kcal. Cottage pie is the mince per
  // 100 g; Stew is (426 + 40) / 200 × 100 = 233 kcal, (39 + 1) / 2 = 20 g,
  // from (642 + 40) / 2 = 341 kcal and (93 + 1) / 2 = 47 g.
  await expect(
    sheet.getByRole('button', { name: 'Also updates 2 recipes' }),
  ).toBeVisible()
  await expect(sheet.getByRole('listitem')).toHaveText([
    /^Cottage pie\s*was 214 142 kcal · was 31 13 g protein \/100g\s*$/,
    /^Stew\s*was 341 233 kcal · was 47 20 g protein \/100g\s*$/,
  ])

  // A number field commits on blur.
  await protein.press('Tab')
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(sheet).toBeHidden()

  const catalog = page.getByRole('main').getByRole('list').first()
  await expect(catalog.getByRole('listitem')).toHaveText([
    /^Cottage pie\s*Recipe\s*142 kcal · 13 g protein \/100g/,
    /^Mince\s*142 kcal · 13 g protein \/100g$/,
    /^Onion\s*40 kcal · 1 g protein \/100g$/,
    /^Stew\s*Recipe\s*233 kcal · 20 g protein \/100g/,
  ])
})
