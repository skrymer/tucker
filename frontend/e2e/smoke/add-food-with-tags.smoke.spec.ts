import { test, expect } from './support/smoke-test'

// F18 slice 3 smoke: a User tags a Food in the same step as adding it, against
// the real backend — a new Tag created as it is typed, an existing one picked
// from the list, and both on the Food's /foods row the moment the sheet closes.
// The per-test reset wipes the seed, so there is no cleanup.
const API = 'http://localhost:8080/api'

test('a Food added with Tags carries them on its row at once', async ({
  page,
  goto,
  request,
}) => {
  const existing = await request.post(`${API}/tags`, {
    data: { name: 'Snack' },
  })
  expect(existing.status()).toBe(201)

  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Add food' }).click()
  const sheet = page.getByRole('dialog', { name: /add food/i })
  await sheet.getByLabel(/^name$/i).fill('Rolled oats')
  // A number field commits on blur, so each macro is typed into the focused input.
  await sheet.getByLabel(/protein \/100\s*g/i).click()
  await page.keyboard.type('13')
  await sheet.getByLabel(/carbs \/100\s*g/i).click()
  await page.keyboard.type('60')
  await sheet.getByLabel(/fat \/100\s*g/i).click()
  await page.keyboard.type('7')

  const picker = sheet.getByRole('combobox', { name: 'Tags' })
  await picker.fill('breakfast')
  await page.getByRole('option', { name: /breakfast/ }).click()
  await picker.fill('snack')
  await page.getByRole('option', { name: 'Snack', exact: true }).click()
  await sheet.getByRole('button', { name: /save food/i }).click()
  await expect(sheet).toBeHidden()

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
