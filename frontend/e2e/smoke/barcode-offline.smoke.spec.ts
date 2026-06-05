import { test, expect } from './support/smoke-test'
import type { APIRequestContext } from '@playwright/test'

// F8 slice 4 smoke: offline degrade. Decoding runs locally and still works
// offline, but the lookup needs the network. When the lookup fails on the
// network, the flow must degrade to the same barcode-pre-filled manual entry as
// a miss (ADR 0006), so the user can still add the Food. We simulate offline by
// failing only the barcode-lookup request at the network layer; the catalog
// save and cleanup calls still reach the real backend. Cleans up after itself —
// the docker volume persists between runs.

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

test('an offline lookup degrades to manual entry carrying the barcode', async ({
  page,
  goto,
  request,
}) => {
  const barcode = `9991111${Date.now()}`.slice(0, 13)
  const foodName = `Smoke offline ${Date.now()}`
  await deleteFoodByBarcode(request, barcode)

  // Simulate offline for the lookup only: abort the barcode-lookup request the
  // way a dropped connection would, leaving the catalog endpoints reachable.
  await page.route('**/api/foods/barcode/**', (route) => route.abort())

  let createdId: number | undefined
  try {
    await goto('/foods', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: 'Add food' }).click()
    const sheet = page.getByRole('dialog', { name: /add food/i })
    await expect(sheet).toBeVisible()

    await sheet.getByLabel(/barcode/i).fill(barcode)
    await sheet.getByRole('button', { name: /look up/i }).click()

    // The failed lookup degrades to a blank manual form, barcode preserved.
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

    // The barcode rode along to the created Food, so no work was lost offline.
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
