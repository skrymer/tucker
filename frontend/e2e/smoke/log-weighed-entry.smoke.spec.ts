import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// Slice 2 smoke: the full UI → API → DB path for logging a Weighed entry
// against the real backend. Creates a food in the catalog, logs an
// entry against it through the UI, asserts the dashboard reflects it,
// then deletes the entry and the food to leave the docker volume
// unchanged between runs.
test('user logs a Weighed entry from Today and the dashboard updates', async ({
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

  // Setup: seed a food in the catalog.
  const created = await request.post('http://localhost:8080/api/foods', {
    data: { name: foodName, proteinPer100g, carbsPer100g, fatPer100g },
  })
  expect(created.status()).toBe(201)
  const food = (await created.json()) as { id: number; name: string }

  let entryId: number | undefined
  try {
    await goto('/', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: /log entry/i }).click()
    const sheet = page.getByRole('dialog', { name: /log entry/i })
    await expect(sheet).toBeVisible()

    await sheet.getByRole('tab', { name: 'Weighed' }).click()

    // The visible trigger is a button whose accessible name is "Show
    // popup" (Reka UI's combobox internal label); UFormField's "Food"
    // label points at a sibling hidden input. Click the trigger by role
    // so the popup actually opens. Options render in a portal at
    // document.body, so the option locator is scoped to `page`.
    await sheet.getByRole('button', { name: 'Show popup' }).click()
    await page.getByRole('option', { name: foodName }).click()
    // Confirm the trigger now shows the picked food before moving on,
    // so the picker portal has actually closed.
    await expect(sheet.getByText(foodName)).toBeVisible()

    // UInputNumber's underlying NumberField doesn't pick up programmatic
    // .fill() reliably — use keyboard typing into the focused input.
    await sheet.getByLabel('Grams').click()
    await page.keyboard.type(String(grams))
    await sheet.getByRole('button', { name: /log weighed entry/i }).click()

    await expect(sheet).toBeHidden()
    await expect(
      page.getByText(`${foodName} — ${expectedKcal} kcal`),
    ).toBeVisible()

    // Capture the logged entry id for cleanup.
    const today = todayIso()
    const list = await request.get('http://localhost:8080/api/entries', {
      params: { date: today },
    })
    const entries = (await list.json()) as Array<{
      id: number
      foodName?: string
    }>
    const entry = entries.find((e) => e.foodName === foodName)
    expect(
      entry,
      'logged weighed entry should be returned by GET /api/entries',
    ).toBeDefined()
    entryId = entry!.id
  } finally {
    if (entryId !== undefined) {
      await request.delete(`http://localhost:8080/api/entries/${entryId}`)
    }
    await request.delete(`http://localhost:8080/api/foods/${food.id}`)
  }
})
