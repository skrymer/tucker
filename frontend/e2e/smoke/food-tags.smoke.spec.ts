import { test, expect } from './support/smoke-test'

// F18 slice 1 smoke: a User tags a Food against the real backend — a plain Food from
// its Edit sheet, a Recipe from the editor its row's Edit opens (ADR 0037) — the Tag
// created as it is typed, the Food's Tags saved by id — and the Tag is still on the
// row after a reload, so it was persisted rather than held in the page. An existing Tag typed in another case is offered by the list and
// picked there, keeping its own spelling. The per-test reset wipes the seed, so
// there is no cleanup.
const API = 'http://localhost:8080/api'

test('a Tag put on a Food from its Edit sheet is still there after a reload', async ({
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
  const existing = await request.post(`${API}/tags`, {
    data: { name: 'Snack' },
  })
  expect(existing.status()).toBe(201)

  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Edit Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Rolled oats' })
  const picker = sheet.getByRole('combobox', { name: 'Tags' })

  await picker.fill('breakfast')
  await page.getByRole('option', { name: /breakfast/ }).click()
  await picker.fill('snack')
  await page.getByRole('option', { name: 'Snack', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(sheet).toBeHidden()

  await page.reload()

  await expect(
    page
      .getByRole('list', { name: 'Tags on Rolled oats' })
      .getByRole('listitem'),
  ).toHaveText(['breakfast', 'Snack'])

  const tags = (await (await request.get(`${API}/tags`)).json()) as Array<{
    name: string
    foodCount: number
  }>
  expect(tags).toEqual([
    expect.objectContaining({ name: 'breakfast', foodCount: 1 }),
    expect.objectContaining({ name: 'Snack', foodCount: 1 }),
  ])
})

test('a Tag put on a Recipe in the editor its row’s Edit opens is still there after a reload', async ({
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
      name: 'Porridge',
      cookedWeightG: 300,
      ingredients: [{ foodId: oats, grams: 80 }],
    },
  })
  expect(porridge.status()).toBe(201)
  const existing = await request.post(`${API}/tags`, {
    data: { name: 'Snack' },
  })
  expect(existing.status()).toBe(201)

  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Edit Porridge' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Porridge' })
  const picker = sheet.getByRole('combobox', { name: 'Tags' })

  await picker.fill('breakfast')
  await page.getByRole('option', { name: /breakfast/ }).click()
  await picker.fill('snack')
  await page.getByRole('option', { name: 'Snack', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(sheet).toBeHidden()

  await page.reload()

  await expect(
    page.getByRole('list', { name: 'Tags on Porridge' }).getByRole('listitem'),
  ).toHaveText(['breakfast', 'Snack'])

  const tags = (await (await request.get(`${API}/tags`)).json()) as Array<{
    name: string
    foodCount: number
  }>
  expect(tags).toEqual([
    expect.objectContaining({ name: 'breakfast', foodCount: 1 }),
    expect.objectContaining({ name: 'Snack', foodCount: 1 }),
  ])
})
