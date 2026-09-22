import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'
import { expectCreated, expectStatus } from './support/seeding'

// A new User's first fortnight: the Calorie Budget is not biased low by the
// smoothing's warm-up, proven end to end against the real backend. No /api mocks.

const API = 'http://localhost:8080/api'

/** The window the adaptive Maintenance correction looks back over. */
const ADAPTIVE_WINDOW_DAYS = 14

/** Clears the coverage floor the correction demands (10 of the 14 window days). */
const DAYS_THEY_LOGGED = 10

/** What this User actually averages on the days they log. */
const DAILY_INTAKE_KCAL = 1800

/** The real fall across the fortnight — 0.1 kg a day, weighed every day. */
const DAILY_FALL_KG = 0.1
const START_WEIGHT_KG = 86

test('a new User weighing daily is not budgeted against a fraction of their loss', async ({
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

  // Fifteen readings, the first of them ever, falling a tenth of a kilo a day. The
  // window's anchor is therefore this User's *first* reading and the far end their
  // fifteenth, so the two carry very different amounts of the warm-up: their plain
  // difference shows barely half the fall (ADR 0032). Just over half, in fact —
  // this fortnight sits at 0.504 and is the closest ordinary case to the floor
  // below which the correction is capped rather than applied.
  for (let i = ADAPTIVE_WINDOW_DAYS; i >= 0; i--) {
    await expectStatus(
      request.post(`${API}/weight`, {
        data: {
          date: daysAgo(i),
          weightKg:
            START_WEIGHT_KG - DAILY_FALL_KG * (ADAPTIVE_WINDOW_DAYS - i),
        },
      }),
      200,
    )
  }

  for (let i = 0; i < DAYS_THEY_LOGGED; i++) {
    await expectCreated(
      request.post(`${API}/entries/estimated`, {
        data: {
          date: daysAgo(ADAPTIVE_WINDOW_DAYS - i),
          label: "Day's intake",
          calories: DAILY_INTAKE_KCAL,
          protein: 130,
        },
      }),
    )
  }

  // Opening Today is what fires the first review, off everything seeded above.
  await goto('/', { waitUntil: 'hydration' })

  // Seeded to exactly the coverage floor, so a run that crosses UTC midnight between
  // the clock reading above and this review drops to nine logged days and falls back
  // to the seed. Say which happened rather than leaving it to look like the warm-up.
  const review = await (await request.get(`${API}/weekly-review`)).json()
  expect(review.reviewedOn, 'the run crossed UTC midnight').toBe(today)

  // 1800 kcal averaged over the 10 logged days, plus the real 1.4 kg x 7700 / 14
  // days = 770 kcal/day of shortfall. Nothing eaten today, so the ring reads 0
  // against it. Measured off the two trend points as they stand, the same fortnight
  // would show 0.706 kg and read 2188 — 382 kcal/day tighter than this body earned.
  await expect(page.getByText('0 / 2570 kcal')).toBeVisible()

  // The adaptive path is what produced it, not a seed that landed nearby — and the
  // unrounded figure, which the page's rounding would have let through.
  expect(review.intakeTargets.maintenanceBasis).toBe('ADAPTIVE')
  expect(review.intakeTargets.calorieBudgetKcal).toBeCloseTo(2570, 1)
})
