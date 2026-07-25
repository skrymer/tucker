import { test, expect } from './support/smoke-test'
import type { APIRequestContext } from '@playwright/test'
import { fakeBarcodeCamera } from '../support/fake-camera'

// F8 slice 2 smoke: the camera scan path end-to-end against the real backend.
// The camera hardware is faked (see fake-camera.ts); the app's real zxing-wasm
// decoder still does the reading.
//
// An unknown barcode is fully deterministic: it misses the catalog and Open
// Food Facts, falling through to manual entry even if OFF is unreachable. The
// test cleans up the Food it creates (the docker volume persists between runs).

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

test('a scanned barcode resolves through the lookup and saves a Food', async ({
  page,
  goto,
  request,
}) => {
  // Unknown barcode → catalog miss + provider miss → manual entry pre-filled.
  const barcode = `9${Date.now()}`.slice(0, 13)
  await deleteFoodByBarcode(request, barcode)

  await fakeBarcodeCamera(page, barcode)

  let createdId: number | undefined
  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: 'Add food' }).click()
    const sheet = page.getByRole('dialog', { name: /add food/i })
    await expect(sheet).toBeVisible()

    await sheet.getByRole('button', { name: /scan barcode/i }).click()

    // The decoded barcode lands in the always-on manual input and runs the same
    // lookup — proving the camera path branches identically to typing one in.
    await expect(sheet.getByLabel(/barcode/i)).toHaveValue(barcode, {
      timeout: 15_000,
    })

    // Unknown barcode → miss → blank form carrying the scanned barcode.
    await expect(sheet.getByLabel(/^name$/i)).toHaveValue('')
    const foodName = `Scan smoke ${barcode}`
    await sheet.getByLabel(/^name$/i).fill(foodName)
    await sheet.getByLabel(/protein \/100\s*g/i).click()
    await page.keyboard.type('5')
    await sheet.getByLabel(/carbs \/100\s*g/i).click()
    await page.keyboard.type('5')
    await sheet.getByLabel(/fat \/100\s*g/i).click()
    await page.keyboard.type('5')

    await sheet.getByRole('button', { name: /save food/i }).click()

    // Saving a Food from the barcode flow opens the "log it now" continuation
    // (F8 slice 3) instead of closing the sheet. This smoke only proves the
    // scan resolved and saved a Food — logging it now has its own smoke — so
    // dismiss the offer with "Not now".
    await expect(sheet.getByText(/saved to your catalog/i)).toBeVisible()
    await sheet.getByRole('button', { name: /not now/i }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText(foodName)).toBeVisible()

    // The scanned barcode rode along to the created Food.
    const list = await request.get(`${API}/foods`)
    const foods = (await list.json()) as Array<{
      id: number
      name: string
      barcode?: string
    }>
    const created = foods.find((f) => f.name === foodName)
    expect(created, 'scanned Food should be in the catalog').toBeDefined()
    expect(created!.barcode).toBe(barcode)
    createdId = created!.id
  } finally {
    if (createdId !== undefined) {
      await request.delete(`${API}/foods/${createdId}`)
    }
  }
})
