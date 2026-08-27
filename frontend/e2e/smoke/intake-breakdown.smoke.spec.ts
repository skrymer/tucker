import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F14 slice 1 smoke: the Intake Breakdown on /review, end-to-end against the real
// backend. Foods and Entries are seeded through the API and asserted on screen.
// No teardown: the auto `freshDatabase` fixture resets the DB before every smoke
// (issue #70), so seeding is all a test owes.
const API = 'http://localhost:8080/api'

test("the day's calories are divided between the Foods they went on", async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // Macros chosen so the backend derives round figures: chicken is
  // 4x31 + 4x0 + 9x3.6 = 156.4 kcal/100 g, rice 4x8 + 4x28 + 9x0.3 = 146.7.
  const chicken = await request.post(`${API}/foods`, {
    data: {
      name: 'Smoke chicken',
      proteinPer100g: 31,
      carbsPer100g: 0,
      fatPer100g: 3.6,
    },
  })
  expect(chicken.status()).toBe(201)
  const chickenFood = (await chicken.json()) as { id: number; name: string }

  const rice = await request.post(`${API}/foods`, {
    data: {
      name: 'Smoke rice',
      proteinPer100g: 8,
      carbsPer100g: 28,
      fatPer100g: 0.3,
    },
  })
  expect(rice.status()).toBe(201)
  const riceFood = (await rice.json()) as { id: number; name: string }

  // The chicken is logged twice, so the section has to merge two Entries into
  // one slice — 200 g at 156.4/100 g is 312.8 kcal and 62 g of protein.
  for (const grams of [120, 80]) {
    const logged = await request.post(`${API}/entries/weighed`, {
      data: { date: today, foodId: chickenFood.id, grams },
    })
    expect(logged.status()).toBe(201)
  }

  // 200 g of rice: 293.4 kcal, 16 g protein.
  const loggedRice = await request.post(`${API}/entries/weighed`, {
    data: { date: today, foodId: riceFood.id, grams: 200 },
  })
  expect(loggedRice.status()).toBe(201)

  // An estimate with no protein figure: it slices by its label and is flagged.
  const canteen = await request.post(`${API}/entries/estimated`, {
    data: {
      date: today,
      label: 'Smoke canteen',
      calories: 640,
      protein: null,
    },
  })
  expect(canteen.status()).toBe(201)

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: "What you're eating" })

  // 312.8 + 293.4 + 640 = 1246 kcal for the day.
  await expect(section.getByText('1246 kcal')).toBeVisible()

  // Biggest first, each stating what it cost and what it returned. The canteen
  // omits protein rather than claiming 0 g, and carries its estimate flag.
  const rows = section.getByRole('listitem')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Smoke canteen')
  await expect(rows.nth(0)).toContainText('640 kcal')
  await expect(rows.nth(0)).not.toContainText('protein')
  await expect(rows.nth(0)).toContainText('est.')
  await expect(rows.nth(0)).toContainText('51%')

  await expect(rows.nth(1)).toContainText(chickenFood.name)
  await expect(rows.nth(1)).toContainText('313 kcal · 62 g protein')
  await expect(rows.nth(1)).toContainText('25%')

  await expect(rows.nth(2)).toContainText(riceFood.name)
  await expect(rows.nth(2)).toContainText('293 kcal · 16 g protein')
  await expect(rows.nth(2)).toContainText('24%')
})
