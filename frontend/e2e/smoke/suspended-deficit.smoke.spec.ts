import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'
import { expectCreated, expectStatus } from './support/seeding'

// A deficit Maintenance cannot supply is suspended, never floored (ADR 0030).
//
// Only a real stack can reach this: the Goal is set while Maintenance is high
// enough to carry its deficit, and Maintenance is then driven *down* by the
// adaptive engine correcting against a fortnight of genuinely low logged intake.
// Nothing here fixes a figure — the engine derives every one of them, which is
// the whole claim, and a mocked summary would be asserting the fixture.
//
// It is also the regression test for the outage (issue #305): `GET /api/summary`
// runs the lazy catch-up on every read, so this state used to answer 400 for
// every day it lasted and take the app down with it.
const API = 'http://localhost:8080/api'

// 160 cm and 40 years old: a small body, so the seed Maintenance carries a
// 1.5 kg/week deficit at 70 kg and nothing like it once the engine corrects.
// The birth date is relative — an absolute one ticks the seeded age over on its
// own anniversary, and the Budget this asserts moves with no code change.
const bodyStats = () => ({
  sex: 'FEMALE',
  birthDate: isoShiftDays(todayIso(), -40 * 365 - 10),
  heightCm: 160,
})

/** The window the adaptive correction reads, and the coverage it needs (ADR 0018). */
const LOGGED_DAYS = 10
const DAILY_KCAL = 800

test('a deficit the engine can no longer supply is suspended, and Today says so', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  await expectStatus(request.put(`${API}/profile`, { data: bodyStats() }), 200)

  // A flat trend across the window: two equal readings, so the weight term
  // contributes nothing and Maintenance lands on the intake average exactly.
  for (const days of [-14, -1]) {
    await expectStatus(
      request.post(`${API}/weight`, {
        data: {
          date: isoShiftDays(today, days),
          weightKg: 70,
          clientToday: today,
        },
      }),
      200,
    )
  }

  // Set while it still fits: at 70 kg the seed is 1874.6 kcal and 1.5 kg/week
  // demands 1650. Ordering matters — logging first would refuse this outright,
  // which is the *other* half of the rule and has its own coverage.
  await expectCreated(
    request.post(`${API}/goal`, {
      data: {
        startedOn: today,
        targetWeightKg: 60,
        rateKgPerWeek: 1.5,
        clientToday: today,
      },
    }),
  )

  const before = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  expect(before.deficitSuspended).toBe(false)
  expect(before.calorieBudget).toBeCloseTo(1874.6 - 1650, 1)

  // Ten logged days at 800 kcal clears the coverage floor, so the engine adapts
  // to an intake far below the deficit the Goal is still asking for.
  for (let day = 1; day <= LOGGED_DAYS; day++) {
    await expectCreated(
      request.post(`${API}/entries/estimated`, {
        data: {
          date: isoShiftDays(today, -day),
          label: `day -${day}`,
          calories: DAILY_KCAL,
          protein: 60,
        },
      }),
    )
  }

  // Toggling Calorie Tracking recomputes today's review (ADR 0024), which is
  // what makes the new intake take effect now rather than at the next cadence.
  // It is also one of the two endpoints the refusal used to roll back: this PUT
  // itself 400'd and silently failed to save the setting.
  for (const tracksCalories of [false, true]) {
    await expectStatus(
      request.put(`${API}/profile`, {
        data: { ...bodyStats(), tracksCalories, clientToday: today },
      }),
      200,
    )
  }

  const after = await (
    await request.get(`${API}/summary`, { params: { date: today } })
  ).json()
  // The endpoint stays up — the outage itself — and the Budget is the
  // Maintenance the engine derived, not a floor and not the earlier figure.
  expect(after.deficitSuspended).toBe(true)
  expect(after.calorieBudget).toBeCloseTo(DAILY_KCAL, 1)
  // The Protein Floor rides through untouched: 2 g/kg of a 70 kg trend.
  expect(after.proteinFloor).toBeCloseTo(140, 1)

  await goto('/', { waitUntil: 'hydration' })

  await expect(page.getByText(/No deficit is being applied/i)).toBeVisible()
  await expect(page.getByText(/holding steady, not losing/)).toBeVisible()
  await expect(
    page.getByRole('link', { name: /ease your goal/i }),
  ).toBeVisible()

  // And the same rate is now refused at the gate, on the field it is about —
  // the two halves of the rule meeting on one User.
  const refused = await request.post(`${API}/goal`, {
    data: {
      startedOn: today,
      targetWeightKg: 60,
      rateKgPerWeek: 1.5,
      clientToday: today,
    },
  })
  expect(refused.status()).toBe(400)
  const body = await refused.json()
  expect(body.field).toBe('rateKgPerWeek')
  expect(body.message).toContain('slower rate')
})
