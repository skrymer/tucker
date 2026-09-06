import { test, expect } from './support/smoke-test'
import { isoShiftDays, todayIso } from '../support/date'

// F16 slice 1 smoke: the Log destination against the real backend. Seeds three
// Foods and a rotation of Entries over the API, asserts the ranking *at the
// endpoint* — the one place the order, the tie-break and the cap are decided
// (ADR 0002) — then logs through the grid in the UI and finds the Entry on
// Today. The per-test reset wipes the seed, so there is no cleanup.
const API = 'http://localhost:8080/api'

test('the Log destination ranks a rotation and logs the food tapped in it', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const window = { from: isoShiftDays(today, -29), to: today }

  async function createFood(name: string): Promise<number> {
    const created = await request.post(`${API}/foods`, {
      data: { name, proteinPer100g: 10, carbsPer100g: 4, fatPer100g: 0.2 },
    })
    expect(created.status()).toBe(201)
    return (await created.json()).id as number
  }

  async function logWeighed(foodId: number, on: string) {
    const logged = await request.post(`${API}/entries/weighed`, {
      data: { date: on, foodId, grams: 100 },
    })
    expect(logged.status()).toBe(201)
  }

  const stamp = Date.now()
  const oats = await createFood(`Rolled oats ${stamp}`)
  const eggs = await createFood(`Free-range eggs ${stamp}`)
  const dropped = await createFood(`Sourdough loaf ${stamp}`)

  // Eggs three times, oats twice — and the loaf nine times, but all of it just
  // outside the window, so a ranking that widened its span would put it first.
  for (const on of [today, isoShiftDays(today, -3), isoShiftDays(today, -9)]) {
    await logWeighed(eggs, on)
  }
  for (const on of [isoShiftDays(today, -1), isoShiftDays(today, -5)]) {
    await logWeighed(oats, on)
  }
  for (let i = 0; i < 9; i++) {
    await logWeighed(dropped, isoShiftDays(today, -30 - i))
  }
  // An Estimated Entry names no Food, so however often it is logged it can
  // never rank.
  for (let i = 0; i < 12; i++) {
    const estimated = await request.post(`${API}/entries/estimated`, {
      data: { date: today, label: `Work canteen ${stamp}`, calories: 50 },
    })
    expect(estimated.status()).toBe(201)
  }

  const ranked = await request.get(`${API}/foods/frequent`, { params: window })
  expect(ranked.status()).toBe(200)
  expect(
    ((await ranked.json()) as { name: string }[]).map((f) => f.name),
  ).toEqual([`Free-range eggs ${stamp}`, `Rolled oats ${stamp}`])

  await goto('/log', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: `Log Rolled oats ${stamp}` }).click()
  const sheet = page.getByRole('dialog', { name: `Log Rolled oats ${stamp}` })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel(/weight \(g\)/i).click()
  await page.keyboard.type('80')
  // The number field commits its model on blur, so leave it before submitting.
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: /log entry/i }).click()
  await expect(sheet).toBeHidden()

  // The Entry landed on Today, with the calories the backend derived from the
  // food's per-100g figures: 4×10 + 4×4 + 9×0.2 = 57.8 kcal/100 g, so 80 g is 46.
  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText(`Rolled oats ${stamp} — 46 kcal`)).toBeVisible()
})
