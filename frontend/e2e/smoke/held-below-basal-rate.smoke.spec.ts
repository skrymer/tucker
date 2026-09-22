import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'
import { expectCreated, expectStatus } from './support/seeding'

// A window whose logged intake the scale contradicts does not adapt, and says so.
// Both coverage floors are cleared, so nothing ADR 0018 checks refuses this — the
// balance itself is what the engine will not publish, because it lands under the
// body's basal rate (ADR 0031). Proven end to end against the real backend, which
// used to answer 400 on this data and take Today down with it. No /api mocks.

const API = 'http://localhost:8080/api'

/** The window the adaptive Maintenance correction looks back over. */
const ADAPTIVE_WINDOW_DAYS = 14

/** Ten of the fourteen window days, so the logging floor is cleared with room to spare. */
const LOGGED_DAY_OFFSETS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5]

/**
 * Enough intake to clear every floor and far too little to explain the gain. The
 * trend rises 2 kg across the window, which is 1100 kcal/day of surplus — so the
 * balance is 800 - 1100 = -300, and the log is what must be wrong.
 */
const PART_LOGGED_DAY_KCAL = 800

test('a Calorie Budget held by a contradicted log says what would lift it', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const daysAgo = (n: number) => isoShiftDays(today, -n)

  // No Goal, so this is Maintenance Mode and the Budget *is* Maintenance — no
  // deficit stands between the arithmetic and the figure on the page.
  await expectStatus(
    request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    }),
    200,
  )

  // Weighed every day across the window, climbing 86.0 to 88.0 — a fortnight's
  // holiday gain, not a figure only a test could produce. The EWMA moves a tenth of
  // the way towards each reading, so the *trend* ends ~0.9 kg up: enough to make the
  // balance impossible without seeding a body that gained 20 kg overnight.
  await expectStatus(
    request.post(`${API}/weight`, {
      data: { date: daysAgo(ADAPTIVE_WINDOW_DAYS + 6), weightKg: 86 },
    }),
    200,
  )
  for (let offset = ADAPTIVE_WINDOW_DAYS; offset >= 0; offset--) {
    const kg = 86 + (2 * (ADAPTIVE_WINDOW_DAYS - offset)) / ADAPTIVE_WINDOW_DAYS
    await expectStatus(
      request.post(`${API}/weight`, {
        data: { date: daysAgo(offset), weightKg: Number(kg.toFixed(1)) },
      }),
      200,
    )
  }

  // An earlier review, so today's has a figure to hold rather than a cold start to
  // seed from. Its own window carries no logged days at all and no earlier review,
  // so it is the formula seed.
  //
  // Minted by *reading* that day's summary rather than by posting a review: the
  // manual trigger refuses a clientToday more than a day off the server's
  // (ADR 0014), while the lazy catch-up runs for whatever day is asked for.
  await expectStatus(request.get(`${API}/summary?date=${daysAgo(8)}`), 200)
  const earlier = await (await request.get(`${API}/weekly-review`)).json()
  expect(earlier.reviewedOn).toBe(daysAgo(8))
  expect(earlier.intakeTargets.maintenanceBasis).toBe('FORMULA_SEED')
  const heldKcal = earlier.intakeTargets.calorieBudgetKcal

  for (const offset of LOGGED_DAY_OFFSETS) {
    await expectCreated(
      request.post(`${API}/entries/estimated`, {
        data: {
          date: daysAgo(offset),
          label: 'Breakfast',
          calories: PART_LOGGED_DAY_KCAL,
          protein: 40,
        },
      }),
    )
  }

  const review = await (
    await request.post(`${API}/weekly-review?clientToday=${today}`)
  ).json()
  expect(review.reviewedOn, 'the run crossed UTC midnight').toBe(today)

  // Neither coverage floor is what held it — the days are logged and the window is
  // weighed — so the reason has to be the balance itself.
  expect(review.intakeTargets.maintenanceBasis).toBe('HELD')
  expect(review.intakeTargets.heldReason).toBe('BELOW_BASAL_RATE')
  expect(review.intakeTargets.calorieBudgetKcal).toBeCloseTo(heldKcal, 1)

  await goto('/', { waitUntil: 'hydration' })

  // The page renders at all, which is the whole of issue #332: this window used to
  // make GET /api/summary answer 400 every day it lasted. Nothing is logged *today*
  // — the part-logged days are all behind us — so the ring reads zero against the
  // figure that was carried forward.
  await expect(page.getByText(`0 / ${Math.round(heldKcal)} kcal`)).toBeVisible()

  // And it says why the figure stopped moving. A user who logged ten of fourteen
  // days and weighed in has no way to guess this one — and is not accused of
  // under-logging, which is a cause the engine cannot know (ADR 0031).
  await expect(
    page.getByText(/Your logged food and your weight do not line up yet/),
  ).toBeVisible()

  await goto('/review', { waitUntil: 'hydration' })

  await expect(
    page.getByText('Held · log and scale disagree').first(),
  ).toBeVisible()
})
