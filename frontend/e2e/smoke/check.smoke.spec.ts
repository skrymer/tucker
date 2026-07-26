import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import { fakeBarcodeCamera } from '../support/fake-camera'

// F11 Check smokes: scanning a package on the Check tab, end to end against the
// real backend. The scanned barcode belongs to a Food seeded in the catalog, so
// the lookup resolves catalog-first and the test never depends on Open Food
// Facts being reachable. Only the camera hardware is faked — the app's real
// zxing-wasm decoder reads the frames, and every figure on screen is computed by
// the backend from the review's actual Budget and Floor.
//
// The per-test reset (smoke-test.ts) wipes the seeded review, Food and entries.
const API = 'http://localhost:8080/api'

/**
 * Complete setup the way a real install does — a Weekly Review is what produces
 * the Calorie Budget and Protein Floor that every figure on a Check is a share
 * of — and put one scannable Food in the catalog.
 *
 * The Food is 10 g protein and nothing else, so Atwater derives 40 kcal/100 g
 * and it sits far above pace at 25 g of protein per 100 kcal.
 */
async function seedScannableFood(request: APIRequestContext, name: string) {
  const today = todayIso()
  const barcode = `8${Date.now()}`.slice(0, 13)

  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  await request.post(`${API}/weight`, { data: { date: today, weightKg: 85 } })
  const goal = await request.post(`${API}/goal`, {
    data: { startedOn: today, targetWeightKg: 80, rateKgPerWeek: 0.5 },
  })
  expect(goal.status()).toBe(201)

  const created = await request.post(`${API}/foods`, {
    data: { name, barcode, proteinPer100g: 10, carbsPer100g: 0, fatPer100g: 0 },
  })
  expect(created.status()).toBe(201)

  const summary = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  const budget = Math.round(summary.calorieBudget as number)
  const floor = Math.round(summary.proteinFloor as number)
  expect(budget).toBeGreaterThan(0)

  return { today, barcode, budget, floor }
}

test('scanning a product states what it costs and returns, and saves nothing', async ({
  page,
  goto,
  request,
}) => {
  const { today, barcode, budget, floor } = await seedScannableFood(
    request,
    'Check smoke skyr',
  )

  await fakeBarcodeCamera(page, barcode)
  await goto('/check', { waitUntil: 'hydration' })

  // The real decoder needs a few frames off the synthetic stream.
  await expect(
    page.getByRole('heading', { name: 'Check smoke skyr' }),
  ).toBeVisible({ timeout: 20_000 })

  // Cost and return are shares of the whole day's targets, and the figures come
  // from the backend's own Budget and Floor rather than anything invented here.
  await expect(page.getByText(`40 / ${budget} kcal`)).toBeVisible()
  await expect(page.getByText(`10 / ${floor} g protein`)).toBeVisible()
  // 10 g protein in 40 kcal is 25 g per 100 kcal — far above any pace, so the
  // day is asked to make up nothing.
  await expect(page.getByText('25 g protein per 100 kcal')).toBeVisible()
  await expect(page.getByText('Keeps pace on its own.')).toBeVisible()
  await expect(page.getByText(/A whole day of it is [\d,]+ g/)).toBeVisible()

  // A Check creates nothing: the catalog still holds only the seeded Food, and
  // the day is untouched.
  const foods = (await (await request.get(`${API}/foods`)).json()) as unknown[]
  expect(foods).toHaveLength(1)
  const after = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  expect(after.entries).toHaveLength(0)
  expect(after.caloriesConsumed).toBe(0)
})

test('dialling the portion moves the cost and return but not the food’s character', async ({
  page,
  goto,
  request,
}) => {
  const { barcode, budget, floor } = await seedScannableFood(
    request,
    'Check portion skyr',
  )

  await fakeBarcodeCamera(page, barcode)
  await goto('/check', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: 'Check portion skyr' }),
  ).toBeVisible({ timeout: 20_000 })

  // A Check opens at 100 g, the only portion no provider serving size is
  // trustworthy enough to beat (ADR 0022).
  await expect(page.getByText('100 g', { exact: true })).toBeVisible()
  await expect(page.getByText(`40 / ${budget} kcal`)).toBeVisible()
  await expect(page.getByText(`10 / ${floor} g protein`)).toBeVisible()
  // Captured rather than computed here: the day's allowance is the backend's,
  // and the point is only that dialling the portion leaves it exactly as it was.
  const allowance = page.getByText(/^A whole day of it is/)
  const allowanceAtDefault = await allowance.textContent()

  // Dial to the top of the track. The thumb takes the keyboard, so this drives
  // the same control a thumb drags in a shop without depending on its geometry.
  await page.getByRole('slider').press('End')

  // Two and a half times the portion is two and a half times the cost and the
  // return — 100 kcal and 25 g of protein.
  await expect(page.getByText('250 g', { exact: true })).toBeVisible()
  await expect(page.getByText(`100 / ${budget} kcal`)).toBeVisible()
  await expect(page.getByText(`25 / ${floor} g protein`)).toBeVisible()
  await expect(page.getByText('25 g protein', { exact: true })).toBeVisible()

  // Cost and return both scale with grams, so their ratio cancels grams
  // entirely (ADR 0022) — sliding changes how much of the day the food takes,
  // never what kind of food it is.
  await expect(page.getByText('25 g protein per 100 kcal')).toBeVisible()
  await expect(page.getByText('Keeps pace on its own.')).toBeVisible()
  await expect(allowance).toHaveText(allowanceAtDefault!)
})
