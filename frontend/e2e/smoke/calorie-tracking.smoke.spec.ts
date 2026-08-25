import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import { visibleNav } from '../support/nav'

// Calorie Tracking is a stored choice on the Profile, Tucker takes its shape
// from it, and the engine underneath stops producing figures nobody can act on.
//
// The wire assertions are as much the point as the screen ones: the Budget's
// absence has to be real, and the toggle has to move it on the User's own day
// rather than at the next weekly cadence. Only a real stack can say either.
const API = 'http://localhost:8080/api'

const BODY_STATS = { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 }

/**
 * A set-up User with an active Goal — the first Goal fires the weekly review,
 * which is what makes this a real stack rather than a fixture.
 */
async function seedUser(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  tracksCalories = false,
): Promise<string> {
  const today = todayIso()

  const [profile, weight] = await Promise.all([
    request.put(`${API}/profile`, {
      data: { ...BODY_STATS, tracksCalories },
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

/** The day's summary as the API states it — the shape the assertions read. */
async function summaryOn(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  date: string,
): Promise<{
  calorieBudget: number | null
  proteinFloor: number | null
  dayStatus: string | null
  trendWeightKg: number | null
  setupComplete: boolean
}> {
  const summary = await request.get(`${API}/summary?date=${date}`)
  expect(summary.ok()).toBe(true)
  return await summary.json()
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

test('no Calorie Budget is derived with Calorie Tracking off', async ({
  request,
}) => {
  const today = await seedUser(request)

  // Asserted on the wire, not on the screen: the SPA hides the day summary for
  // this User either way, so reading `/` would only prove the client hid it. The
  // Budget has to be *absent*, because the adaptive correction needs 10 logged
  // days in 14 and this User logs none — so every review after the first would
  // hold the seed forever and present it as a target (ADR 0024).
  const day = await summaryOn(request, today)
  expect(day.calorieBudget).toBeNull()
  expect(day.proteinFloor).toBeNull()
  expect(day.dayStatus).toBeNull()

  // The review still ran, and its other job is on the wire: a dated reading of
  // where the trend is going. And setup is complete, so nothing nags about it.
  expect(day.trendWeightKg).toBeGreaterThan(0)
  expect(day.setupComplete).toBe(true)

  const history = await request.get(`${API}/weekly-review/history`)
  expect(history.ok()).toBe(true)
  const reviews = (await history.json()) as { intakeTargets: unknown }[]
  expect(reviews.length).toBeGreaterThan(0)
  expect(reviews.every((review) => review.intakeTargets === null)).toBe(true)
})

test('turning Calorie Tracking off and back on moves the Budget the same day', async ({
  page,
  goto,
  request,
}) => {
  const today = await seedUser(request, true)
  expect((await summaryOn(request, today)).calorieBudget).toBeGreaterThan(0)

  await goto('/profile', { waitUntil: 'hydration' })

  // Off: the stale Budget must not linger on `/` for up to a week, so the save
  // force-recomputes today's review rather than waiting for the cadence.
  await page.getByRole('radio', { name: /weight only/i }).click()
  await page.getByRole('button', { name: /save profile/i }).click()

  await expect
    .poll(async () => (await summaryOn(request, today)).calorieBudget)
    .toBeNull()

  // And back on: a real re-entry, not a promise for next week.
  await page.getByRole('radio', { name: /calories and weight/i }).click()
  await page.getByRole('button', { name: /save profile/i }).click()

  await expect
    .poll(async () => (await summaryOn(request, today)).calorieBudget)
    .toBeGreaterThan(0)
})

test('Tucker takes the shape of the choice', async ({
  page,
  goto,
  request,
}) => {
  await seedUser(request)

  await goto('/', { waitUntil: 'hydration' })

  // Foods and Check are dead ends for this User, and on a phone that is two of
  // five thumb-reachable slots.
  const nav = visibleNav(page)
  await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Review' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Profile' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Foods' })).toBeHidden()
  await expect(nav.getByRole('link', { name: 'Check' })).toBeHidden()

  // Nothing to log, and nothing to log it against.
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
