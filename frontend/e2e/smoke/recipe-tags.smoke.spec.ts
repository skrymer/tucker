import { test, expect } from './support/smoke-test'

// F18 slice 4 smoke: a User tags a Recipe while building it and changes its Tags
// while editing it, against the real backend — and an edit that leaves the Tags
// alone keeps them, because the builder resends the ones it was seeded with.
// The per-test reset wipes the seed, so there is no cleanup.
const API = 'http://localhost:8080/api'

test('a Recipe built with a Tag carries it, and editing it changes or keeps its Tags', async ({
  page,
  goto,
  request,
}) => {
  // Two passes through the builder against the real backend.
  test.slow()

  const mince = await request.post(`${API}/foods`, {
    data: {
      name: 'Beef mince',
      proteinPer100g: 20,
      carbsPer100g: 0,
      fatPer100g: 10,
    },
  })
  expect(mince.status()).toBe(201)
  const existing = await request.post(`${API}/tags`, {
    data: { name: 'Batch cook' },
  })
  expect(existing.status()).toBe(201)

  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Add food' }).click()
  await page
    .getByRole('dialog', { name: /add food/i })
    .getByRole('tab', { name: 'Recipe' })
    .click()
  const builder = page.getByRole('dialog', { name: /add recipe/i })
  await builder.getByLabel(/recipe name/i).fill('Bolognese')
  await builder.getByRole('button', { name: 'Add ingredient' }).click()
  await builder.getByRole('button', { name: /Beef mince/ }).click()
  await builder.getByLabel('Grams').click()
  await page.keyboard.type('600')
  await page.keyboard.press('Tab')
  await builder.getByRole('button', { name: 'Add', exact: true }).click()

  const picker = builder.getByRole('combobox', { name: 'Tags' })
  await picker.fill('dinner')
  await page.getByRole('option', { name: /dinner/ }).click()
  await builder.getByRole('button', { name: /save recipe/i }).click()
  await expect(builder).toBeHidden()

  const rowTags = page
    .getByRole('list', { name: 'Tags on Bolognese' })
    .getByRole('listitem')
  await expect(rowTags).toHaveText(['dinner'])

  // Edit: add the existing Tag beside the one it carries.
  const editSheet = await openEdit()
  await editSheet.getByRole('combobox', { name: 'Tags' }).fill('batch')
  await page.getByRole('option', { name: 'Batch cook', exact: true }).click()
  await editSheet.getByRole('button', { name: /save changes/i }).click()
  await expect(editSheet).toBeHidden()
  await expect(rowTags).toHaveText(['Batch cook', 'dinner'])

  // Edit only the cooked weight: the Tags stay as they were.
  const again = await openEdit()
  const cooked = again.getByLabel(/cooked weight/i)
  await cooked.click({ clickCount: 3 })
  await page.keyboard.type('450')
  await page.keyboard.press('Tab')
  await again.getByRole('button', { name: /save changes/i }).click()
  await expect(again).toBeHidden()

  await page.reload()
  await expect(rowTags).toHaveText(['Batch cook', 'dinner'])

  const tags = (await (await request.get(`${API}/tags`)).json()) as Array<{
    name: string
    foodCount: number
  }>
  expect(tags).toEqual([
    expect.objectContaining({ name: 'Batch cook', foodCount: 1 }),
    expect.objectContaining({ name: 'dinner', foodCount: 1 }),
  ])

  async function openEdit() {
    await page
      .getByRole('button', { name: 'View ingredients in Bolognese' })
      .click()
    const sheet = page.getByRole('dialog', { name: /Bolognese/ })
    await sheet.getByRole('button', { name: /edit recipe/i }).click()
    return sheet
  }
})
