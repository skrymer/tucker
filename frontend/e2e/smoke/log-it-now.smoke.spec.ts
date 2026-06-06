import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import type { APIRequestContext } from '@playwright/test'

// F8 slice 3 smoke: the offered "log it now" continuation end-to-end against the
// real backend. A barcode creates a Food, then the user logs it as a Weighed
// Entry from the same flow and it shows up on the dashboard. Scanning never logs
// by itself — the user supplies the grams here. Cleans up the entry and the food
// (the docker volume persists between runs).

const API = 'http://localhost:8080/api'

async function deleteFoodByBarcode(
  request: APIRequestContext,
  barcode: string,
) {
  const list = await request.get(`${API}/foods`)
  const foods = (await list.json()) as Array<{ id: number; barcode?: string }>
  for (const food of foods.filter((f) => f.barcode === barcode)) {
    await request.delete(`${API}/foods/${food.id}`)
  }
}

test('user creates a Food from a barcode then logs it now from the same flow', async ({
  page,
  goto,
  request,
}) => {
  // Unknown barcode → catalog miss + provider miss → manual entry, fully
  // deterministic (no Open Food Facts dependency).
  const barcode = `9991000${Date.now()}`.slice(0, 13)
  const foodName = `Smoke log-it-now ${Date.now()}`
  // 4 * 13 + 4 * 67 + 9 * 7 = 383 kcal /100g → 100 g logged is 383 kcal.
  const grams = 100
  const expectedKcal = 383
  await deleteFoodByBarcode(request, barcode)

  let foodId: number | undefined
  let entryId: number | undefined
  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: 'Add food' }).click()
    const sheet = page.getByRole('dialog', { name: /add food/i })
    await expect(sheet).toBeVisible()

    // Barcode → miss → blank manual form carrying the barcode.
    await sheet.getByLabel(/barcode/i).fill(barcode)
    await sheet.getByRole('button', { name: /look up/i }).click()
    await expect(sheet.getByLabel(/^name$/i)).toHaveValue('')

    await sheet.getByLabel(/^name$/i).fill(foodName)
    await sheet.getByLabel(/protein \/100\s*g/i).click()
    await page.keyboard.type('13')
    await sheet.getByLabel(/carbs \/100\s*g/i).click()
    await page.keyboard.type('67')
    await sheet.getByLabel(/fat \/100\s*g/i).click()
    await page.keyboard.type('7')
    await sheet.getByRole('button', { name: /save food/i }).click()

    // The Food now exists and the flow offers to log it now — preselected, but
    // it waits for the grams the user enters (no Entry is created automatically).
    await expect(sheet.getByText(/saved to your catalog/i)).toBeVisible()
    await sheet.getByLabel(/grams/i).click()
    await page.keyboard.type(String(grams))
    await sheet.getByRole('button', { name: /log it now/i }).click()

    await expect(sheet).toBeHidden()

    // The Weighed Entry shows up on the dashboard with the derived calories.
    await goto('/', { waitUntil: 'hydration' })
    await expect(
      page.getByText(`${foodName} — ${expectedKcal} kcal`),
    ).toBeVisible()

    // Capture ids for cleanup.
    const foodsList = await request.get(`${API}/foods`)
    const foods = (await foodsList.json()) as Array<{
      id: number
      barcode?: string
    }>
    foodId = foods.find((f) => f.barcode === barcode)?.id

    const today = todayIso()
    const entriesList = await request.get(`${API}/entries`, {
      params: { date: today },
    })
    const entries = (await entriesList.json()) as Array<{
      id: number
      foodName?: string
    }>
    entryId = entries.find((e) => e.foodName === foodName)?.id
    expect(entryId, 'logged Weighed Entry should be returned').toBeDefined()
  } finally {
    if (entryId !== undefined) {
      await request.delete(`${API}/entries/${entryId}`)
    }
    if (foodId !== undefined) {
      await request.delete(`${API}/foods/${foodId}`)
    }
  }
})
