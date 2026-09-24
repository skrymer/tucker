import { test, expect } from './support/smoke-test'

// F18 slice 1 smoke: a User tags a Food from its row on /foods against the real
// backend — the Tag created as it is typed, the Food's Tags saved by id — and the
// Tag is still on the row after a reload, so it was persisted rather than held in
// the page. An existing Tag typed in another case is offered by the list and
// picked there, keeping its own spelling. The per-test reset wipes the seed, so
// there is no cleanup.
const API = 'http://localhost:8080/api'

test('a Tag put on a Food from its row is still there after a reload', async ({
  page,
  goto,
  request,
}) => {
  const created = await request.post(`${API}/foods`, {
    data: {
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

  await page.getByRole('button', { name: 'Tags for Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Tags for Rolled oats' })
  const picker = sheet.getByRole('combobox')

  await picker.fill('breakfast')
  await page.getByRole('option', { name: /breakfast/ }).click()
  await picker.fill('snack')
  await page.getByRole('option', { name: 'Snack', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save tags' }).click()
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
