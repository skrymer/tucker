import { test, expect } from './support/smoke-test'
import { isoShiftDays, todayIso } from '../support/date'

// The Intake Breakdown on /review, end-to-end against the real backend, over both
// of its windows. Foods and Entries are seeded through the API and asserted on
// screen.
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

test('the week is a wider question than the day, and says how much of it was logged', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  const skyr = await request.post(`${API}/foods`, {
    data: {
      name: 'Smoke skyr',
      proteinPer100g: 11,
      carbsPer100g: 4,
      fatPer100g: 0.2,
    },
  })
  expect(skyr.status()).toBe(201)
  const skyrFood = (await skyr.json()) as { id: number; name: string }

  // Eaten today, and eaten again three days ago — the same Food is one slice
  // over the week, and the week is the only window the older day is in.
  for (const on of [today, isoShiftDays(today, -3)]) {
    const logged = await request.post(`${API}/entries/weighed`, {
      data: { date: on, foodId: skyrFood.id, grams: 200 },
    })
    expect(logged.status()).toBe(201)
  }

  // Only on the older day, so it is absent from today and present in the week.
  const takeaway = await request.post(`${API}/entries/estimated`, {
    data: {
      date: isoShiftDays(today, -3),
      label: 'Smoke takeaway',
      calories: 900,
      protein: null,
    },
  })
  expect(takeaway.status()).toBe(201)

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: "What you're eating" })

  // 200 g of skyr: 4x11 + 4x4 + 9x0.2 = 61.8 kcal/100 g, so 124 kcal today.
  await expect(section.getByText('124 kcal', { exact: true })).toBeVisible()
  await expect(section.getByText('Smoke takeaway')).toBeHidden()
  await expect(section.getByText(/days logged/)).toBeHidden()

  await section.getByRole('tab', { name: 'Last 7 days' }).click()

  // Both days, and both Foods: 247.2 + 900 = 1147 kcal over two logged days.
  await expect(section.getByText('1147 kcal', { exact: true })).toBeVisible()
  await expect(section.getByText('Smoke takeaway')).toBeVisible()
  await expect(section.getByText('2 of 7 days logged')).toBeVisible()

  const rows = section.getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Smoke takeaway')
  await expect(rows.nth(0)).toContainText('900 kcal')
  await expect(rows.nth(1)).toContainText(skyrFood.name)
  await expect(rows.nth(1)).toContainText('247 kcal · 44 g protein')
})
