import { test, expect } from '@nuxt/test-utils/playwright'
import type { APIRequestContext, Locator } from '@playwright/test'

// F8 slice 1 smoke: the typed-barcode pipeline end-to-end against the real
// backend (which resolves catalog-first, then the Open Food Facts provider).
//
// The candidate case depends on a stable, widely-scanned product existing in
// Open Food Facts; the miss case is fully deterministic (an unknown barcode
// 404s, falling through even if OFF is unreachable). Both clean up after
// themselves — the docker volume persists between runs.

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

/** Type into a UInputNumber only if it's empty (NumberField ignores .fill()). */
async function fillIfEmpty(input: Locator, value: string) {
  if ((await input.inputValue()) === '') {
    await input.click()
    await input.page().keyboard.type(value)
  }
}

test('typed known barcode resolves to a candidate and saves a Food', async ({
  page,
  goto,
  request,
}) => {
  // Nutella — one of the most-scanned products in Open Food Facts.
  const barcode = '3017620422003'
  // Start clean so the lookup is a provider candidate, not a catalog hit.
  await deleteFoodByBarcode(request, barcode)

  let createdId: number | undefined
  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: 'Add food' }).click()
    const sheet = page.getByRole('dialog', { name: /add food/i })
    await expect(sheet).toBeVisible()

    await sheet.getByLabel(/barcode/i).fill(barcode)
    await sheet.getByRole('button', { name: /look up/i }).click()

    // The candidate pre-fills the name and shows the provider's stated energy
    // as a cross-check (calories are recalculated from macros on save).
    await expect(sheet.getByLabel(/^name$/i)).not.toHaveValue('', {
      timeout: 15_000,
    })
    await expect(sheet.getByText(/stated on the label/i)).toBeVisible()

    // Complete any macro the provider didn't supply, then save.
    await fillIfEmpty(sheet.getByLabel(/protein \/100\s*g/i), '6')
    await fillIfEmpty(sheet.getByLabel(/carbs \/100\s*g/i), '57')
    await fillIfEmpty(sheet.getByLabel(/fat \/100\s*g/i), '31')

    await sheet.getByRole('button', { name: /save food/i }).click()

    // Saved → the flow offers to log it now (issue #52); decline here, the
    // continuation has its own smoke.
    await expect(
      sheet.getByRole('button', { name: /log it now/i }),
    ).toBeVisible()
    await sheet.getByRole('button', { name: /not now/i }).click()
    await expect(sheet).toBeHidden()

    // The Food was created carrying the scanned barcode.
    const list = await request.get(`${API}/foods`)
    const foods = (await list.json()) as Array<{
      id: number
      barcode?: string
    }>
    const created = foods.find((f) => f.barcode === barcode)
    expect(created, 'created Food should carry the barcode').toBeDefined()
    createdId = created!.id
  } finally {
    if (createdId !== undefined) {
      await request.delete(`${API}/foods/${createdId}`)
    }
  }
})

test('typed unknown barcode drops to manual entry carrying the barcode', async ({
  page,
  goto,
  request,
}) => {
  // Not a real product → catalog miss + provider miss → manual entry.
  const barcode = `9990000${Date.now()}`.slice(0, 13)
  const foodName = `Smoke miss ${Date.now()}`
  await deleteFoodByBarcode(request, barcode)

  let createdId: number | undefined
  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: 'Add food' }).click()
    const sheet = page.getByRole('dialog', { name: /add food/i })
    await expect(sheet).toBeVisible()

    await sheet.getByLabel(/barcode/i).fill(barcode)
    await sheet.getByRole('button', { name: /look up/i }).click()

    // The form stays blank (no candidate) and is ready for manual entry.
    await expect(sheet.getByLabel(/^name$/i)).toHaveValue('')
    await sheet.getByLabel(/^name$/i).fill(foodName)
    await sheet.getByLabel(/protein \/100\s*g/i).click()
    await page.keyboard.type('5')
    await sheet.getByLabel(/carbs \/100\s*g/i).click()
    await page.keyboard.type('5')
    await sheet.getByLabel(/fat \/100\s*g/i).click()
    await page.keyboard.type('5')

    await sheet.getByRole('button', { name: /save food/i }).click()

    // Saved → decline the offered "log it now" continuation (its own smoke).
    await expect(
      sheet.getByRole('button', { name: /log it now/i }),
    ).toBeVisible()
    await sheet.getByRole('button', { name: /not now/i }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText(foodName)).toBeVisible()

    // The typed barcode rode along to the created Food.
    const list = await request.get(`${API}/foods`)
    const foods = (await list.json()) as Array<{
      id: number
      name: string
      barcode?: string
    }>
    const created = foods.find((f) => f.name === foodName)
    expect(created, 'created Food should be in the catalog').toBeDefined()
    expect(created!.barcode).toBe(barcode)
    createdId = created!.id
  } finally {
    if (createdId !== undefined) {
      await request.delete(`${API}/foods/${createdId}`)
    }
  }
})
