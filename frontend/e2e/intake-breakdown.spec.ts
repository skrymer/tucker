import { expect, test } from './support/test'
import {
  mockIntakeBreakdown,
  mockIntakeBreakdownError,
  mockNoActiveGoal,
  mockProfile,
  mockReviewHistory,
} from './support/mock-api'
import { weeklyReview } from '../test/review-fixtures'
import {
  breakdownItem,
  intakeBreakdown,
} from '../test/intake-breakdown-fixtures'

// The Intake Breakdown on /review: what a day's calories went on, biggest first.
// Shares are of what was eaten, so nothing here mentions the Calorie Budget.

const TRACKING = {
  sex: 'MALE',
  birthDate: '1990-06-15',
  heightCm: 180,
  tracksCalories: true,
}

const WEIGHT_ONLY = { ...TRACKING, tracksCalories: false }

const HISTORY = [
  weeklyReview({ id: 1, reviewedOn: '2026-06-01', trendWeightKg: 86 }),
]

/** A day of ten items, so the tail folds and an estimate is among the ringed. */
const A_FULL_DAY = intakeBreakdown({
  totalCalories: 2000,
  items: [
    breakdownItem({
      foodId: 1,
      name: 'Chicken breast',
      calories: 520,
      protein: 97,
      share: 0.26,
    }),
    breakdownItem({
      foodId: null,
      name: 'Work canteen',
      calories: 480,
      protein: null,
      share: 0.24,
      isEstimate: true,
    }),
    breakdownItem({
      foodId: 2,
      name: 'Basmati rice',
      calories: 350,
      protein: 8,
      share: 0.175,
    }),
    breakdownItem({
      foodId: 3,
      name: 'Cottage pie',
      calories: 240,
      protein: 22,
      share: 0.12,
    }),
    breakdownItem({
      foodId: 4,
      name: 'Skyr',
      calories: 120,
      protein: 20,
      share: 0.06,
    }),
    breakdownItem({
      foodId: 5,
      name: 'Banana',
      calories: 105,
      protein: 1,
      share: 0.0525,
    }),
    breakdownItem({
      foodId: 6,
      name: 'Olive oil',
      calories: 90,
      protein: 0,
      share: 0.045,
    }),
    breakdownItem({
      foodId: 7,
      name: 'Almonds',
      calories: 60,
      protein: 2,
      share: 0.03,
    }),
    breakdownItem({
      foodId: 8,
      name: 'Blueberries',
      calories: 25,
      protein: 0,
      share: 0.0125,
    }),
    breakdownItem({
      foodId: 9,
      name: 'Black coffee',
      calories: 10,
      protein: 0,
      share: 0.005,
    }),
  ],
})

test.describe('with Calorie Tracking on', () => {
  test.beforeEach(async ({ page }) => {
    await mockProfile(page, TRACKING)
    await mockNoActiveGoal(page)
    await mockReviewHistory(page, HISTORY)
  })

  // The snapshot is the assertion that the ring carries no identity of its own:
  // it is aria-hidden, so nothing of it appears here, and every figure it encodes
  // has to be in a legend row instead.
  test('each slice states what it cost and what it returned, and the ring says nothing', async ({
    page,
    goto,
  }) => {
    await mockIntakeBreakdown(page, A_FULL_DAY)

    await goto('/review', { waitUntil: 'hydration' })

    await expect(
      page.getByRole('heading', { name: "What you're eating" }),
    ).toBeVisible()
    await expect(page.getByRole('main')).toMatchAriaSnapshot()
  })

  test('a day with nothing logged keeps the section and says so', async ({
    page,
    goto,
  }) => {
    await mockIntakeBreakdown(
      page,
      intakeBreakdown({ totalCalories: 0, items: [] }),
    )

    await goto('/review', { waitUntil: 'hydration' })

    await expect(page.getByText('Nothing logged yet')).toBeVisible()
  })

  test('a failed load offers a retry rather than a blank card', async ({
    page,
    goto,
  }) => {
    await mockIntakeBreakdownError(page)

    await goto('/review', { waitUntil: 'hydration' })

    await expect(
      page.getByRole('heading', { name: "Couldn't load what you're eating" }),
    ).toBeVisible()

    // And the retry actually re-fetches: the second attempt succeeds.
    await mockIntakeBreakdown(page, A_FULL_DAY)
    await page.getByRole('button', { name: 'Retry' }).click()

    await expect(page.getByText('Chicken breast')).toBeVisible()
  })
})

test('with Calorie Tracking off the section is absent and never asked for', async ({
  page,
  goto,
}) => {
  await mockProfile(page, WEIGHT_ONLY)
  await mockNoActiveGoal(page)
  await mockReviewHistory(page, HISTORY)

  let requests = 0
  await page.route('**/api/intake-breakdown**', (route) => {
    requests += 1
    return route.fulfill({ json: A_FULL_DAY })
  })

  await goto('/review', { waitUntil: 'hydration' })

  // The ledger is up, so the page has settled and the fetch would have fired.
  await expect(
    page.getByRole('button', { name: 'Run review now' }),
  ).toBeVisible()

  await expect(
    page.getByRole('region', { name: "What you're eating" }),
  ).toBeHidden()
  expect(requests).toBe(0)
})
