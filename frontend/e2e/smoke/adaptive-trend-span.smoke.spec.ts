import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'
import { expectCreated, expectStatus } from './support/seeding'

// The adaptive weight term is divided by the days the trend anchor actually
// spans, proven end to end against the real backend. No /api mocks.

const API = 'http://localhost:8080/api'

/** The window the adaptive Maintenance correction looks back over. */
const ADAPTIVE_WINDOW_DAYS = 14

/**
 * How far back this User last weighed before the window opened. Meaningful only
 * as "older than the window start" — tie it to the window, or widening the window
 * would leave the anchor inside it and this spec green over the wrong arithmetic.
 */
const ANCHOR_DAYS_AGO = ADAPTIVE_WINDOW_DAYS + 6

/** Clears the coverage floor the correction demands (10 of the 14 window days). */
const DAYS_THEY_LOGGED = 10

test('the Calorie Budget spreads a trend change over the days its anchor spans', async ({
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

  // Two readings 20 days apart. The EWMA seeds at 86.0 and the second moves it a
  // tenth of the way, to 85.8 — a 0.2 kg fall across those 20 days.
  await expectStatus(
    request.post(`${API}/weight`, {
      data: { date: daysAgo(ANCHOR_DAYS_AGO), weightKg: 86 },
    }),
    200,
  )
  await expectStatus(
    request.post(`${API}/weight`, { data: { date: today, weightKg: 84 } }),
    200,
  )

  for (let i = 0; i < DAYS_THEY_LOGGED; i++) {
    await expectCreated(
      request.post(`${API}/entries/estimated`, {
        data: {
          date: daysAgo(ADAPTIVE_WINDOW_DAYS - i),
          label: "Day's intake",
          calories: 2000,
          protein: 130,
        },
      }),
    )
  }

  // Opening Today is what fires the first review, off everything seeded above.
  await goto('/', { waitUntil: 'hydration' })

  // Seeded to exactly the coverage floor, so a run that crosses UTC midnight between
  // the clock reading above and this review drops to nine logged days and falls back
  // to the seed. Say which happened rather than leaving it to look like the divisor.
  const review = await (await request.get(`${API}/weekly-review`)).json()
  expect(review.reviewedOn, 'the run crossed UTC midnight').toBe(today)

  // 2000 kcal averaged over the 10 logged days, plus 0.2 kg x 7700 / 20 days =
  // 77 kcal/day of shortfall. Nothing eaten today, so the ring reads 0 against it.
  // Over a fixed 14 days the same change would read 2110.
  await expect(page.getByText('0 / 2077 kcal')).toBeVisible()

  // The adaptive path is what produced it, not a seed that landed nearby — and the
  // unrounded figure, which the page's rounding would have let through. The floor and
  // the span's far end are pinned by WeeklyReviewServiceTest: with the anchor already
  // past the window and the last reading dated today, neither moves this figure.
  expect(review.intakeTargets.maintenanceBasis).toBe('ADAPTIVE')
  expect(review.intakeTargets.calorieBudgetKcal).toBeCloseTo(2077, 1)
})
