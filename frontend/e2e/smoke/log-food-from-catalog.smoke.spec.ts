import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// Issue #103 smoke: the full UI → API → DB path for logging a Weighed
// entry straight from the Foods catalog. Seeds a food, taps its row on
// /foods, enters grams in the grams-only sheet, and asserts the polite
// "Entry logged" toast plus the created entry via the API — the user
// never leaves the catalog. Cleans up entry + food.
test('user logs a food from the catalog and stays on the Foods page', async ({
  page,
  goto,
  request,
}) => {
  const foodName = `Smoke catalog log ${Date.now()}`
  // 4 * 13 + 4 * 67 + 9 * 7 = 383 kcal /100g, so 100 g logged is 383 kcal.
  const grams = 100

  const created = await request.post('http://localhost:8080/api/foods', {
    data: {
      name: foodName,
      proteinPer100g: 13,
      carbsPer100g: 67,
      fatPer100g: 7,
    },
  })
  expect(created.status()).toBe(201)
  const food = (await created.json()) as { id: number; name: string }

  let entryId: number | undefined
  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: `Log ${foodName}` }).click()

    const sheet = page.getByRole('dialog', { name: `Log ${foodName}` })
    await expect(sheet).toBeVisible()

    // UInputNumber's underlying NumberField doesn't pick up programmatic
    // .fill() reliably — use keyboard typing into the focused input (the
    // same workaround as the Weighed and Add-food smokes).
    await sheet.getByLabel(/weight \(g\)/i).click()
    await page.keyboard.type(String(grams))
    await sheet.getByRole('button', { name: /log entry/i }).click()

    await expect(sheet).toBeHidden()
    // The dashboard isn't visible here, so success is announced (ADR 0005)
    // and the user stays on the catalog.
    await expect(
      page
        .getByRole('region', { name: /notifications/i })
        .getByRole('listitem')
        .filter({ hasText: 'Entry logged' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Foods', level: 1 }),
    ).toBeVisible()

    // The entry landed on the client-owned today (ADR 0014).
    const list = await request.get('http://localhost:8080/api/entries', {
      params: { date: todayIso() },
    })
    const entries = (await list.json()) as Array<{
      id: number
      foodName?: string
      grams?: number
    }>
    const entry = entries.find((e) => e.foodName === foodName)
    expect(
      entry,
      'logged entry should be returned by GET /api/entries',
    ).toBeDefined()
    expect(entry!.grams).toBe(grams)
    entryId = entry!.id
  } finally {
    if (entryId !== undefined) {
      await request.delete(`http://localhost:8080/api/entries/${entryId}`)
    }
    await request.delete(`http://localhost:8080/api/foods/${food.id}`)
  }
})
