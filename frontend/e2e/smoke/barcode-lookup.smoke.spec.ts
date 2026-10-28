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

    // Saved → the sheet closes onto the catalog (ADR 0028).
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

// Two more recorded payloads: the wrap's fibre, and Heineken's alcohol_100g,
// which OFF states as % vol and Tucker keeps as 5 × 0.789 g per 100 g.
const SCANNED_FIGURES = [
  {
    barcode: '9334169000566',
    name: 'HIGH PROTEIN LOW CARB + FIBRE WRAPS',
    field: /fibre \/100\s*g/i,
    shown: '16.714',
    saved: { fibrePer100g: 16.7142857142857 },
  },
  {
    barcode: '8712000900045',
    name: 'Heineken Beer',
    field: /alc % vol/i,
    shown: '5',
    saved: { alcoholPer100g: 3.945, alcoholAbv: 5 },
  },
]

for (const product of SCANNED_FIGURES) {
  test(`a looked-up ${product.name} prefills and saves what OFF states beyond the macros`, async ({
    page,
    goto,
    request,
  }) => {
    await deleteFoodByBarcode(request, product.barcode)

    let createdId: number | undefined
    try {
      await goto('/foods', { waitUntil: 'hydration' })
      await page.getByRole('button', { name: 'Add food' }).click()
      const sheet = page.getByRole('dialog', { name: /add food/i })

      await sheet.getByLabel(/barcode/i).fill(product.barcode)
      await sheet.getByRole('button', { name: /look up/i }).click()

      await expect(sheet.getByLabel(/^name$/i)).toHaveValue(product.name)
      await expect(sheet.getByLabel(product.field)).toHaveValue(product.shown)
      await sheet.getByRole('button', { name: /save food/i }).click()
      await expect(sheet).toBeHidden()

      const foods = (await (await request.get(`${API}/foods`)).json()) as Array<
        Record<string, unknown> & { id: number; barcode?: string }
      >
      const created = foods.find((f) => f.barcode === product.barcode)
      expect(created, 'created Food should carry the barcode').toBeDefined()
      createdId = created!.id
      for (const [figure, value] of Object.entries(product.saved))
        expect(created![figure] as number).toBeCloseTo(value, 3)
    } finally {
      if (createdId !== undefined) {
        await request.delete(`${API}/foods/${createdId}`)
      }
    }
  })
}

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

    // Saved → the sheet closes onto the catalog (ADR 0028).
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
