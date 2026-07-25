import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import { fakeBarcodeCamera } from '../support/fake-camera'

// F11 slice 1 smoke: scanning a package on the Check tab, end to end against the
// real backend. The scanned barcode belongs to a Food seeded in the catalog, so
// the lookup resolves catalog-first and the test never depends on Open Food
// Facts being reachable. Only the camera hardware is faked — the app's real
// zxing-wasm decoder reads the frames, and every figure on screen is computed by
// the backend from the review's actual Budget and Floor.
//
// The per-test reset (smoke-test.ts) wipes the seeded review, Food and entries.
const API = 'http://localhost:8080/api'

test('scanning a product states what it costs and returns, and saves nothing', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const barcode = `8${Date.now()}`.slice(0, 13)

  // Complete setup the way a real install does, so a Weekly Review produces the
  // Calorie Budget and Protein Floor every figure is a share of.
  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  await request.post(`${API}/weight`, { data: { date: today, weightKg: 85 } })
  const goal = await request.post(`${API}/goal`, {
    data: { startedOn: today, targetWeightKg: 80, rateKgPerWeek: 0.5 },
  })
  expect(goal.status()).toBe(201)

  // A lean Food: 10 g protein and nothing else, so Atwater derives 40 kcal/100 g
  // and it sits far above pace.
  const created = await request.post(`${API}/foods`, {
    data: {
      name: 'Check smoke skyr',
      barcode,
      proteinPer100g: 10,
      carbsPer100g: 0,
      fatPer100g: 0,
    },
  })
  expect(created.status()).toBe(201)

  const summary = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  const budget = Math.round(summary.calorieBudget as number)
  const floor = Math.round(summary.proteinFloor as number)
  expect(budget).toBeGreaterThan(0)

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
