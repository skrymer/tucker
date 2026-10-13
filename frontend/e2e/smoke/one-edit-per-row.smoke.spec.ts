import { test, expect } from './support/smoke-test'

// F19 slice 3 smoke: a plain Food's match is changed and cleared from its Edit
// sheet against the real backend, at once and outside Save (ADR 0027, ADR 0037).
// A Recipe's row Edit opening its editor is driven by food-tags.smoke. The
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
})
