import { expect, test } from './support/test'
import {
  mockIntakeBreakdown,
  mockIntakeBreakdownByWindow,
  mockIntakeBreakdownError,
  mockNoActiveGoal,
  mockProfile,
  mockReviewHistory,
} from './support/mock-api'
import { isoShiftDays } from './support/date'
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

/** The same User's week: different Foods, so a stale day is visible as one. */
const A_FULL_WEEK = intakeBreakdown({
  totalCalories: 9000,
  loggedDays: 5,
  items: [
    breakdownItem({
      foodId: 10,
      name: 'Sourdough',
      calories: 3400,
      protein: 100,
      share: 0.3777,
    }),
    breakdownItem({
      foodId: 2,
      name: 'Basmati rice',
      calories: 3000,
      protein: 70,
      share: 0.3334,
    }),
    breakdownItem({
      foodId: 1,
      name: 'Chicken breast',
      calories: 2600,
      protein: 480,
      share: 0.2889,
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
  test('opens on the day, and asks about seven days ending today when the week is chosen', async ({
    page,
    goto,
  }) => {
    const asked = await mockIntakeBreakdownByWindow(page, (from, to) =>
      from === to ? A_FULL_DAY : A_FULL_WEEK,
    )

    await goto('/review', { waitUntil: 'hydration' })

    // The day is what a User is shown first, and it is one day wide.
    await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByText('Almonds')).toBeVisible()
    expect(asked).toHaveLength(1)
    // A real day on both bounds: a client that dropped the window entirely would
    // otherwise record two empty strings and read as a one-day window.
    expect(asked[0]!.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(asked[0]!.from).toBe(asked[0]!.to)

    await page.getByRole('tab', { name: 'Last 7 days' }).click()

    // The week's own Foods, ranked afresh — nothing of the day survives it.
    await expect(page.getByText('Sourdough')).toBeVisible()
    await expect(page.getByText('Almonds')).toBeHidden()
    await expect(page.getByText('5 of 7 days logged')).toBeVisible()

    expect(asked).toHaveLength(2)
    // Ending on the same day the first window asked about, and seven days wide,
    // so today's Entries are in the week as well as in the day.
    expect(asked[1]!.to).toBe(asked[0]!.to)
    expect(asked[1]!.from).toBe(isoShiftDays(asked[1]!.to, -6))

    // And back again: a toggle that only works one way strands the User on the
    // week until they reload.
    await page.getByRole('tab', { name: 'Today' }).click()

    await expect(page.getByText('Almonds')).toBeVisible()
    await expect(page.getByText('Sourdough')).toBeHidden()
    expect(asked).toHaveLength(3)
    expect(asked[2]!.from).toBe(asked[2]!.to)
  })

  test('opens Other onto the tail it already holds, without asking again', async ({
    page,
    goto,
  }) => {
    const asked = await mockIntakeBreakdownByWindow(page, () => A_FULL_DAY)

    await goto('/review', { waitUntil: 'hydration' })

    // Almonds is the eighth slice and the last on the ring; Blueberries and the
    // coffee are the tail Other folded away.
    await expect(page.getByText('Almonds')).toBeVisible()
    await expect(page.getByText('Blueberries')).toBeHidden()

    await page.getByRole('button', { name: 'Show all 2' }).click()

    // The whole opened section, so the revealed rows' figures, shares and flags
    // are pinned together with the expander's own state.
    await expect(
      page.getByRole('region', { name: "What you're eating" }),
    ).toMatchAriaSnapshot()

    await page.getByRole('button', { name: 'Show less' }).click()
    await expect(page.getByText('Blueberries')).toBeHidden()

    // Re-read at the end, where a late duplicate request would have landed.
    expect(asked).toHaveLength(1)
  })

  test('the ring reads the slice under the pointer out in its own centre', async ({
    page,
    goto,
  }) => {
    await mockIntakeBreakdownByWindow(page, () => A_FULL_DAY)

    await goto('/review', { waitUntil: 'hydration' })

    const ring = page.locator('.intake-ring')
    await expect(ring).toBeVisible()

    // Straight up from the middle is the first arc: the ring starts at twelve
    // o'clock and the backend ranks the biggest slice first. Driven by geometry
    // rather than by hovering the path, whose bounding box centre falls in the
    // hole.
    const box = (await ring.boundingBox())!
    await page.mouse.move(
      box.x + box.width / 2 + 8,
      box.y + box.height / 2 - 74,
    )

    await expect(ring.getByText('Chicken breast')).toBeVisible()
    await expect(ring.getByText('520 kcal · 97 g protein')).toBeVisible()
  })

  test('a tap reads a slice out too, which is the only pointer a phone has', async ({
    page,
    goto,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'Mobile Chrome',
      'a touchscreen is what this is about',
    )
    await mockIntakeBreakdownByWindow(page, () => A_FULL_DAY)

    await goto('/review', { waitUntil: 'hydration' })

    const ring = page.locator('.intake-ring')
    const box = (await ring.boundingBox())!
    // The same arc the pointer test hovers, so the two differ only in how they
    // were touched.
    await page.touchscreen.tap(
      box.x + box.width / 2 + 8,
      box.y + box.height / 2 - 74,
    )

    await expect(ring.getByText('Chicken breast')).toBeVisible()
    await expect(ring.getByText('520 kcal · 97 g protein')).toBeVisible()
  })

  test('an empty day still offers the week, which is the point of asking', async ({
    page,
    goto,
  }) => {
    await mockIntakeBreakdownByWindow(page, (from, to) =>
      from === to
        ? intakeBreakdown({ totalCalories: 0, loggedDays: 0, items: [] })
        : A_FULL_WEEK,
    )

    await goto('/review', { waitUntil: 'hydration' })

    await expect(page.getByText('Nothing logged yet')).toBeVisible()

    await page.getByRole('tab', { name: 'Last 7 days' }).click()

    await expect(page.getByText('Sourdough')).toBeVisible()
    await expect(page.getByText('Nothing logged yet')).toBeHidden()
  })
})

test('with Calorie Tracking off the section is absent and never asked for', async ({
  page,
  goto,
}) => {
  await mockProfile(page, WEIGHT_ONLY)
  await mockNoActiveGoal(page)
  await mockReviewHistory(page, HISTORY)

  const asked = await mockIntakeBreakdownByWindow(page, () => A_FULL_DAY)

  await goto('/review', { waitUntil: 'hydration' })

  // The ledger is up, so the page has settled and the fetch would have fired.
  await expect(
    page.getByRole('button', { name: 'Run review now' }),
  ).toBeVisible()

  await expect(
    page.getByRole('region', { name: "What you're eating" }),
  ).toBeHidden()
  expect(asked).toHaveLength(0)
})
