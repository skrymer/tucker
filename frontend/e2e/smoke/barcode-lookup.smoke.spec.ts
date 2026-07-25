import { test, expect } from './support/smoke-test'
import type { APIRequestContext } from '@playwright/test'

// F8 slice 1 smoke: the typed-barcode pipeline end-to-end against the real
// backend (which resolves catalog-first, then the Open Food Facts provider).
//
// Neither case touches the internet. The smoke stack points the provider's
// base-url at a local stub serving a recorded OFF response (issue #163 — a slow
// OFF reddened a documentation-only PR), so a candidate resolves deterministically
// and an unrecorded barcode 404s into the miss path. Everything on Tucker's side
// of the network boundary is still under test. See
// e2e/smoke/fixtures/off-stub/README.md.

const API = 'http://localhost:8080/api'

// The recorded Nutella payload the stub serves, and the calories Tucker derives
// from it: 4·6.3 + 4·57.5 + 9·30.9. Deliberately *not* the 539 kcal OFF states —
// that is a cross-check the user sees, never a stored value (ADR 0006).
const NUTELLA = {
  barcode: '3017620422003',
  name: 'Nutella',
  protein: 6.3,
  carbs: 57.5,
  fat: 30.9,
  statedKcal: 539,
  atwaterKcal: 533.3,
}

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

test('typed known barcode resolves to a candidate and saves a Food', async ({
  page,
  goto,
  request,
}) => {
  const barcode = NUTELLA.barcode
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

    // The candidate pre-fills the name and every macro the provider supplied,
    // normalised to per-100g.
    await expect(sheet.getByLabel(/^name$/i)).toHaveValue(NUTELLA.name)
    await expect(sheet.getByLabel(/protein \/100\s*g/i)).toHaveValue(
      String(NUTELLA.protein),
    )
    await expect(sheet.getByLabel(/carbs \/100\s*g/i)).toHaveValue(
      String(NUTELLA.carbs),
    )
    await expect(sheet.getByLabel(/fat \/100\s*g/i)).toHaveValue(
      String(NUTELLA.fat),
    )

    // The provider's own energy figure is shown as a cross-check only.
    await expect(
      sheet.getByText(
        `Stated on the label: ${NUTELLA.statedKcal} kcal /100 g.`,
      ),
    ).toBeVisible()

    await sheet.getByRole('button', { name: /save food/i }).click()

    // Saved → the flow offers to log it now (issue #52); decline here, the
    // continuation has its own smoke.
    await expect(
      sheet.getByRole('button', { name: /log it now/i }),
    ).toBeVisible()
    await sheet.getByRole('button', { name: /not now/i }).click()
    await expect(sheet).toBeHidden()

    // The Food was created carrying the scanned barcode, with its calories
    // re-derived by Atwater from the macros rather than taken from the provider.
    const list = await request.get(`${API}/foods`)
    const foods = (await list.json()) as Array<{
      id: number
      barcode?: string
      caloriesPer100g: number
    }>
    const created = foods.find((f) => f.barcode === barcode)
    expect(created, 'created Food should carry the barcode').toBeDefined()
    // Tolerance for the REAL→float round-trip through SQLite, not for slack:
    // 533.3 is the derived figure and 539 is the provider's, ~6 kcal apart.
    expect(created!.caloriesPer100g).toBeCloseTo(NUTELLA.atwaterKcal, 3)
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
  // No such product → catalog miss + provider miss (the stub has no recorded
  // response for it, and answers 404 exactly as OFF does) → manual entry.
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
