import { test, expect } from './support/smoke-test'

// F19 slice 3 smoke: every /foods row has one Edit, against the real backend. A
// plain Food's match is changed and cleared from its Edit sheet, at once and
// outside Save (ADR 0027, ADR 0037), and a Recipe's Edit opens its editor. The
// per-test reset wipes the seed, so there is no cleanup.
const API = 'http://localhost:8080/api'

test('a Food’s match is changed and cleared from its Edit sheet, each at once', async ({
  page,
  goto,
  request,
}) => {
  const created = await request.post(`${API}/foods`, {
    data: {
      tagIds: [],
      name: 'Tasty cheese',
      proteinPer100g: 25,
      carbsPer100g: 0,
      fatPer100g: 33,
    },
  })
  expect(created.status()).toBe(201)
  const cheese = ((await created.json()) as { id: number }).id
  // The best cheddar the real corpus offers for the name, as the queue would.
  const search = (await (
    await request.get(`${API}/reference-foods`, {
      params: { q: 'Tasty cheese' },
    })
  ).json()) as { candidates: { id: number; name: string }[] }
  const [first, second] = search.candidates
  expect(second).toBeDefined()
  const matched = await request.put(`${API}/foods/${cheese}/reference-food`, {
    data: { referenceFoodId: first!.id },
  })
  expect(matched.status()).toBe(200)

  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Tasty cheese' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Tasty cheese' })
  await expect(
    sheet.getByText(`Vitamins and minerals from ${first!.name}`),
  ).toBeVisible()

  await sheet
    .getByRole('button', {
      name: 'Change what Tasty cheese borrows vitamins and minerals from',
    })
    .click()
  const picker = page.getByRole('dialog', { name: 'Match Tasty cheese' })
  await picker
    .getByRole('button', { name: second!.name, exact: false })
    .first()
    .click()
  await expect(picker).toBeHidden()

  // The sheet is still open, and already names the new match.
  await expect(
    sheet.getByText(`Vitamins and minerals from ${second!.name}`),
  ).toBeVisible()

  await sheet
    .getByRole('button', {
      name: 'Clear what Tasty cheese borrows vitamins and minerals from',
    })
    .click()
  await expect(sheet.getByText(/Vitamins and minerals from/)).toHaveCount(0)

  // Closed without a Save, and the clear stands.
  await sheet.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Edit Tasty cheese' }),
  ).toBeVisible()
  await expect(page.getByText(/Vitamins and minerals from/)).toHaveCount(0)
  const food = (await (await request.get(`${API}/foods/${cheese}`)).json()) as {
    referenceFoodId: number | null
  }
  expect(food.referenceFoodId).toBeNull()
})

test('a Recipe’s row Edit opens its editor, and a rename saved there sticks', async ({
  page,
  goto,
  request,
}) => {
  const created = await request.post(`${API}/foods`, {
    data: {
      tagIds: [],
      name: 'Rolled oats',
      proteinPer100g: 13,
      carbsPer100g: 60,
      fatPer100g: 7,
    },
  })
  expect(created.status()).toBe(201)
  const oats = ((await created.json()) as { id: number }).id
  const porridge = await request.post(`${API}/recipes`, {
    data: {
      tagIds: [],
      name: 'Porige',
      cookedWeightG: 300,
      ingredients: [{ foodId: oats, grams: 80 }],
    },
  })
  expect(porridge.status()).toBe(201)

  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Porige' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Porige' })
  const name = sheet.getByRole('textbox', { name: /^Recipe name/ })
  await expect(name).toHaveValue('Porige')
  await name.fill('Porridge')
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(sheet).toBeHidden()

  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Edit Porridge' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Porige' })).toHaveCount(0)
})
