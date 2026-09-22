import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'
import { expectCreated, expectStatus } from './support/seeding'

// A window the scale never saw does not adapt: the Calorie Budget holds the last
// figure that was measured rather than settling on the average intake. Proven end
// to end against the real backend. No /api mocks.

const API = 'http://localhost:8080/api'

/** The window the adaptive Maintenance correction looks back over. */
const ADAPTIVE_WINDOW_DAYS = 14

/**
 * The last day this User weighed. Chosen to sit exactly *on* today's window start
 * and inside yesterday's, which is what makes one review adapt and the next hold —
 * tie it to the window, or widening the window would move it inside today's too and
 * leave this spec green over an engine that never holds.
 */
const LAST_WEIGHED_DAYS_AGO = ADAPTIVE_WINDOW_DAYS

/** Older still, so both reviews have an anchor to measure a change from. */
const ANCHOR_DAYS_AGO = ADAPTIVE_WINDOW_DAYS + 6

/** Clears the logging floor (10 of 14) in both reviews' windows, which differ by a day. */
const LOGGED_DAY_OFFSETS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]

test('a Calorie Budget holds when the window carries no weighing', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const yesterday = isoShiftDays(today, -1)
  const daysAgo = (n: number) => isoShiftDays(today, -n)

  // No Goal, so this is Maintenance Mode and the Budget *is* Maintenance — no
  // deficit stands between the arithmetic and the figure on the page.
  await expectStatus(
    request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    }),
    200,
  )

  // Two readings 2 kg apart, six days between them. Six days of smoothing show
  // under half of any movement, so the correction that divides that shrinkage back
  // out is capped at double and recovers 1.874 of the 2 kg (ADR 0032).
  await expectStatus(
    request.post(`${API}/weight`, {
      data: { date: daysAgo(ANCHOR_DAYS_AGO), weightKg: 86 },
    }),
    200,
  )
  await expectStatus(
    request.post(`${API}/weight`, {
      data: { date: daysAgo(LAST_WEIGHED_DAYS_AGO), weightKg: 84 },
    }),
    200,
  )

  for (const offset of LOGGED_DAY_OFFSETS) {
    await expectCreated(
      request.post(`${API}/entries/estimated`, {
        data: {
          date: daysAgo(offset),
          label: "Day's intake",
          calories: 2000,
          protein: 130,
        },
      }),
    )
  }

  // Yesterday's window opened a day earlier, so the last reading falls *inside* it
  // and there is a change to correct with: 2000 kcal averaged over the 12 logged
  // days, plus 1.874 kg x 7700 / 14 = 1030.8 kcal/day of shortfall.
  const yesterdayReview = await (
    await request.post(`${API}/weekly-review?clientToday=${yesterday}`)
  ).json()
  expect(yesterdayReview.reviewedOn, 'the run crossed UTC midnight').toBe(
    yesterday,
  )
  expect(yesterdayReview.intakeTargets.maintenanceBasis).toBe('ADAPTIVE')
  expect(yesterdayReview.intakeTargets.calorieBudgetKcal).toBeCloseTo(3030.8, 1)

  // Today's window opens on that same reading, so the anchor and the far end are one
  // point and the scale has seen nothing since. Yesterday's 3030.8 is carried forward.
  const review = await (
    await request.post(`${API}/weekly-review?clientToday=${today}`)
  ).json()
  expect(review.reviewedOn, 'the run crossed UTC midnight').toBe(today)

  await goto('/', { waitUntil: 'hydration' })

  // Nothing eaten today, so the ring reads 0 against the held figure. Without the
  // weighing floor this reads 2000 — the average intake to the cent, telling a User
  // who is losing weight that they maintain on what they eat.
  await expect(page.getByText('0 / 3031 kcal')).toBeVisible()

  // The basis is what says it was carried rather than measured, and the unrounded
  // figure is what the page's rounding would otherwise have let through.
  expect(review.intakeTargets.maintenanceBasis).toBe('HELD')
  expect(review.intakeTargets.calorieBudgetKcal).toBeCloseTo(3030.8, 1)
})
