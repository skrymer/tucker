import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import { enterGrams, pickFoodToLog } from '../support/log-page'
import { toast } from '../support/toast'

// The full UI → API → DB path for logging a Weighed entry against the real
// backend, from the Log destination (ADR 0028). Creates a food in the catalog,
// picks it out of the catalog list — a brand-new Food has no Entries, so no
// ranking can hold it — weighs a portion, and reads the Entry back off the API.
// Where it lands on Today is frequent-foods.smoke.spec.ts's subject; what this
// one adds is the toast, which on this path is the only thing that names the
// Entry at the point of focus (ADR 0005). Deletes the entry and the food to
// leave the docker volume unchanged between runs.
test('user logs a Weighed entry from Log and the toast names it', async ({
  page,
  goto,
  request,
}) => {
  const foodName = `Smoke food ${Date.now()}`
  // Macros chosen so backend computes 4 * 13 + 4 * 67 + 9 * 7 = 383 kcal /100g
  // (close to oats — protein 13, carbs 67, fat 7) — then 100g logged is 383 kcal.
  const proteinPer100g = 13
  const carbsPer100g = 67
  const fatPer100g = 7
  const grams = 100
  const expectedKcal = 383
  const expectedProtein = 13
  // How the Entry reads once the backend has derived both figures — the same
  // string the toast and the Today row must show (ADR 0005).
  const expectedName = `${foodName} — ${expectedKcal} kcal · ${expectedProtein} g protein`

  // Setup: seed a food in the catalog.
  const created = await request.post('http://localhost:8080/api/foods', {
    data: { name: foodName, proteinPer100g, carbsPer100g, fatPer100g },
  })
  expect(created.status()).toBe(201)
  const food = (await created.json()) as { id: number; name: string }

  let entryId: number | undefined
  try {
    await goto('/log', { waitUntil: 'hydration' })

    const sheet = await pickFoodToLog(page, {
      section: 'All foods',
      food: foodName,
    })
    await expect(sheet).toBeVisible()
    await enterGrams(page, sheet, grams)
    await sheet.getByRole('button', { name: /log entry/i }).click()

    await expect(sheet).toBeHidden()
    // The toast names the Food and the figures derived from it, so a mis-picked
    // food or a stale grams value is visible without leaving the point of focus.
    await expect(toast(page, 'Entry logged')).toContainText(expectedName)

    // And it reached the database, with the grams the sheet was given.
    const today = todayIso()
    const list = await request.get('http://localhost:8080/api/entries', {
      params: { date: today },
    })
    const entries = (await list.json()) as Array<{
      id: number
      foodName?: string
      grams?: number
    }>
    const entry = entries.find((e) => e.foodName === foodName)
    expect(
      entry,
      'logged weighed entry should be returned by GET /api/entries',
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
