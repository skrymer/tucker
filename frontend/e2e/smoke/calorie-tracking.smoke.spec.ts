import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F12 slice 1 smoke: Calorie Tracking is a stored choice on the Profile, and
// nothing else has moved yet.
//
// The second test is as much the point as the first. This slice deliberately
// changes no behaviour, and the backend still deriving a Calorie Budget for a
// User who has turned tracking off is the one part of that only a real stack
// can say — the SPA never reads the flag, so no mocked layer can tell.
const API = 'http://localhost:8080/api'

const BODY_STATS = { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 }

test('choosing Weight only is remembered across a reload', async ({
  page,
  goto,
  request,
}) => {
  // Seeded rather than typed: the body-stats form is profile.smoke.spec.ts's
  // subject, and driving its date picker here would buy nothing.
  expect((await request.put(`${API}/profile`, { data: BODY_STATS })).ok()).toBe(
    true,
  )

  await goto('/profile', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('radio', { name: /calories and weight/i }),
  ).toBeChecked()

  await page.getByRole('radio', { name: /weight only/i }).click()
  await page.getByRole('button', { name: /save profile/i }).click()

  await expect
    .poll(async () => {
      const res = await request.get(`${API}/profile`)
      if (!res.ok()) return null
      return ((await res.json()) as { tracksCalories: boolean }).tracksCalories
    })
    .toBe(false)

  // Reloaded, so the choice is read back off the backend rather than out of
  // component state that never left the browser.
  await page.reload({ waitUntil: 'load' })

  await expect(page.getByRole('radio', { name: /weight only/i })).toBeChecked()
  await expect(
    page.getByRole('radio', { name: /calories and weight/i }),
  ).not.toBeChecked()
})

test('a Calorie Budget is still derived with Calorie Tracking off', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  const [profile, weight] = await Promise.all([
    request.put(`${API}/profile`, {
      data: { ...BODY_STATS, tracksCalories: false },
    }),
    request.post(`${API}/weight`, { data: { date: today, weightKg: 85 } }),
  ])
  expect(profile.ok()).toBe(true)
  expect(weight.ok()).toBe(true)

  // Setting the first Goal fires the weekly review that yields the budget.
  const goal = await request.post(`${API}/goal`, {
    data: {
      startedOn: today,
      targetWeightKg: 80,
      rateKgPerWeek: 0.5,
      clientToday: today,
    },
  })
  expect(goal.status()).toBe(201)

  await goto('/', { waitUntil: 'hydration' })

  await expect(page.getByText(/\d+ \/ \d+ kcal/)).toBeVisible()
  await expect(page.getByRole('button', { name: /log entry/i })).toBeVisible()
})
