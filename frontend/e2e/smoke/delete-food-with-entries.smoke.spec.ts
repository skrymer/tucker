import { test, expect } from './support/smoke-test'

const API = 'http://localhost:8080/api'

// This smoke deliberately triggers the domain rejection: the DELETE comes back
// 400, which the browser logs as a failed resource load. Everything else stays
// strict.
test.use({
  allowedErrors: [
    /Failed to load resource: the server responded with a status of 400/,
  ],
})

// Issue #107: a Food referenced by a logged Entry is permanent history's anchor
// and cannot be deleted. Seeds a Food, logs a Weighed Entry against it via the
// API, then attempts the delete through the UI — the rule's message is surfaced
// and the Food stays in the catalog. Cleanup removes the Entry then the Food via
// the API, which also proves entry-less deletion still works end-to-end.
test('a food with logged entries cannot be deleted from the catalog', async ({
  page,
  goto,
  request,
}) => {
  const foodName = `Smoke logged ${Date.now()}`

  const created = await request.post(`${API}/foods`, {
    data: {
      name: foodName,
      proteinPer100g: 11,
      carbsPer100g: 4,
      fatPer100g: 0.2,
    },
  })
  expect(created.status()).toBe(201)
  const foodId = ((await created.json()) as { id: number }).id

  const logged = await request.post(`${API}/entries/weighed`, {
    data: { date: '2026-06-01', foodId, grams: 150 },
  })
  expect(logged.status()).toBe(201)
  const entryId = ((await logged.json()) as { id: number }).id

  try {
    await goto('/foods', { waitUntil: 'hydration' })
    await expect(
      page.getByRole('button', { name: `Log ${foodName}` }),
    ).toBeVisible()

    await page.getByRole('button', { name: `Delete ${foodName}` }).click()
    const dialog = page.getByRole('dialog', { name: /delete this food/i })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^delete$/i }).click()

    // The rule's message reaches the user, the confirm closes, and the Food
    // remains in the catalog (no pointless Retry — that path is untested here
    // because there is nothing to retry). Exact match targets the visible toast
    // description, not the assertive aria-live mirror (title + body concatenated)
    // that also carries the text.
    await expect(
      page.getByText(`${foodName} has logged Entries and can't be deleted.`, {
        exact: true,
      }),
    ).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('button', { name: `Log ${foodName}` }),
    ).toBeVisible()

    // Still in the catalog server-side.
    const list = await request.get(`${API}/foods`)
    const foods = (await list.json()) as Array<{ name: string }>
    expect(foods.find((f) => f.name === foodName)).toBeDefined()
  } finally {
    // Remove the Entry, then the now-unreferenced Food — entry-less deletion
    // returns 204 as before.
    await request.delete(`${API}/entries/${entryId}`)
    const deleted = await request.delete(`${API}/foods/${foodId}`)
    expect(deleted.status()).toBe(204)
  }
})
