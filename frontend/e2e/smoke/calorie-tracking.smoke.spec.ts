import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import { visibleNav } from '../support/nav'

// Calorie Tracking is a stored choice on the Profile, and Tucker takes its
// shape from it.
//
// The second test is as much the point as the first: the client hides the log
// half, the API does not withdraw it, so a Calorie Budget is still derived for a
// User who has turned tracking off and nothing else in the app goes
// inconsistent. Only a real stack can say that.
const API = 'http://localhost:8080/api'

const BODY_STATS = { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 }

/**
 * A set-up weight-only User with an active Goal — the first Goal fires the
 * weekly review that yields the Budget, which is what makes this a real stack.
 */
async function seedWeightOnlyUser(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
): Promise<string> {
  const today = todayIso()

  const [profile, weight] = await Promise.all([
    request.put(`${API}/profile`, {
      data: { ...BODY_STATS, tracksCalories: false },
    }),
    request.post(`${API}/weight`, { data: { date: today, weightKg: 85 } }),
  ])
  expect(profile.ok()).toBe(true)
  expect(weight.ok()).toBe(true)

  const goal = await request.post(`${API}/goal`, {
    data: {
      startedOn: today,
      targetWeightKg: 80,
      rateKgPerWeek: 0.5,
      clientToday: today,
    },
  })
  expect(goal.status()).toBe(201)

  return today
}

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
  request,
}) => {
  const today = await seedWeightOnlyUser(request)

  // Asserted on the wire, not on the screen: from slice 2 the SPA hides the day
  // summary for this User, so reading the Budget off `/` would prove the client
  // hid nothing rather than that the backend still derives one.
  const summary = await request.get(`${API}/summary?date=${today}`)
  expect(summary.ok()).toBe(true)
  const { calorieBudget, proteinFloor } = (await summary.json()) as {
    calorieBudget: number | null
    proteinFloor: number | null
  }
  expect(calorieBudget).toBeGreaterThan(0)
  expect(proteinFloor).toBeGreaterThan(0)
})

test('Tucker takes the shape of the choice', async ({
  page,
  goto,
  request,
}) => {
  await seedWeightOnlyUser(request)

  await goto('/', { waitUntil: 'hydration' })

  // Foods and Check are dead ends for this User, and on a phone that is two of
  // five thumb-reachable slots.
  const nav = visibleNav(page)
  await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Review' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Profile' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Foods' })).toBeHidden()
  await expect(nav.getByRole('link', { name: 'Check' })).toBeHidden()

  // The Budget the backend just derived is on the wire and off the screen.
  await expect(page.getByText(/\d+ \/ \d+ kcal/)).toBeHidden()
  await expect(page.getByRole('button', { name: /log entry/i })).toBeHidden()

  // What is left is the weight and the goal, the goal as a ring.
  await expect(
    page.getByRole('heading', { name: "Today's weight", level: 2 }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Goal progress', level: 2 }),
  ).toBeVisible()
  await expect(page.getByText('kg to go')).toBeVisible()

  // The route stays reachable — hiding a tab is navigation, not access control.
  await page.goto('/foods')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Foods' }),
  ).toBeVisible()
})
