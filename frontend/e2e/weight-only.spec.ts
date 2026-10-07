import { expect, test } from './support/test'
import { goalInProgress } from '../test/mocks/handlers/goal'
import {
  profileOf,
  savedProfile,
  weightOnlyProfile,
} from '../test/mocks/handlers/profile'
import { summaryOf } from '../test/mocks/handlers/summary'
import {
  baselineReading,
  weightMeasurements,
} from '../test/mocks/handlers/weight'
import { denyCamera } from './support/fake-camera'
import { visibleNav, withOverflowNav } from './support/nav'

// Tucker takes the shape of the Calorie Tracking choice. With it off there is no
// log half — no Log destination, no Foods or Check, no day summary and no
// budget-change banner — and the Goal is a ring.

/** A finished setup with no targets: the review ran and recorded only a trend. */
const WEIGHT_ONLY_DAY = {
  setupComplete: true,
  caloriesConsumed: 0,
  proteinConsumed: 0,
  estimatedCalorieShare: 0,
  calorieBudget: null,
  proteinFloor: null,
  caloriesRemaining: null,
  proteinRemaining: null,
  dayStatus: null,
  trendWeightKg: 86,
  entries: [],
  budgetChange: null,
}

/** The same day once Calorie Tracking is on and today's review has been recomputed. */
const TRACKING_DAY = {
  ...WEIGHT_ONLY_DAY,
  calorieBudget: 2400,
  proteinFloor: 170,
  caloriesRemaining: 2400,
  proteinRemaining: 170,
  budgetChange: {
    reviewId: 4,
    previousBudgetKcal: 2200,
    newBudgetKcal: 2400,
    previousFloorG: 165,
    newFloorG: 170,
  },
}

test.describe('with Calorie Tracking off', () => {
  test.beforeEach(({ network }) => {
    // The scale starts at the baseline's reading, long before today, so the
    // tile has one resting shape and the snapshot keeps meaning what it meant.
    network.use(
      profileOf(weightOnlyProfile),
      summaryOf(WEIGHT_ONLY_DAY),
      ...weightMeasurements(baselineReading),
      goalInProgress({ paceStatus: 'on-pace' }),
    )
  })

  test('the navigation offers Today and Review, with Profile alone behind More', async ({
    page,
    goto,
  }) => {
    await goto('/', { waitUntil: 'hydration' })

    await expect(visibleNav(page)).toMatchAriaSnapshot()
  })

  test('the Log destination is gone with the rest of the log half', async ({
    page,
    goto,
  }) => {
    await goto('/', { waitUntil: 'hydration' })

    await expect(
      visibleNav(page).getByRole('link', { name: 'Log' }),
    ).toBeHidden()
  })

  test('the Log destination is still reachable by a direct link', async ({
    page,
    goto,
  }) => {
    // Hiding a tab is a navigation choice, not access control — a weight-only
    // User who arrives here can still log what they ate.
    await goto('/log', { waitUntil: 'hydration' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Log' }),
    ).toBeVisible()
  })

  test('Today is the weight and the goal, with nothing to log against', async ({
    page,
    goto,
  }) => {
    await goto('/', { waitUntil: 'hydration' })

    await expect(page.getByRole('main')).toMatchAriaSnapshot()
  })

  test('a weight is still logged from the tile — the one thing left to do', async ({
    page,
    goto,
  }) => {
    await goto('/', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: 'Log weight' }).click()
    await page.getByLabel(/weight \(kg\)/i).fill('84.4')
    await page
      .getByRole('dialog', { name: /log weight/i })
      .getByRole('button', { name: /save weight/i })
      .click()

    await expect(page.getByText('84.4 kg')).toBeVisible()
  })

  test('the Foods catalog is still reachable by a direct link', async ({
    page,
    goto,
  }) => {
    // Hiding a tab is a navigation choice, not access control: a User who
    // tracked before still owns their catalog.
    await goto('/foods', { waitUntil: 'hydration' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Foods' }),
    ).toBeVisible()
    await withOverflowNav(page, async (nav) => {
      await expect(nav.getByRole('link', { name: 'Foods' })).toBeHidden()
    })
  })

  test('Check is still reachable by a direct link', async ({ page, goto }) => {
    // Stubbed like every other /check spec, so the route is exercised without
    // reaching for headless Chromium's absent camera.
    await denyCamera(page)

    await goto('/check', { waitUntil: 'hydration' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Check' }),
    ).toBeVisible()
    // And it says why there is nothing to scan against: every figure a Check
    // states is a share of a Budget this User has chosen not to have. Telling
    // them to finish setup would send them looking for something finished.
    await expect(page.getByText(/calorie tracking is off/i)).toBeVisible()
    await expect(page.getByText(/finish setup/i)).toHaveCount(0)
  })
})

test('turning Calorie Tracking back on restores the log half without a reload', async ({
  page,
  goto,
  network,
}) => {
  const profile = savedProfile(weightOnlyProfile)
  // The save force-recomputes today's review, so the very next summary read
  // carries the Budget back — that same-day return is the point (ADR 0024).
  network.use(
    ...profile.handlers,
    summaryOf(() =>
      profile.current().tracksCalories ? TRACKING_DAY : WEIGHT_ONLY_DAY,
    ),
  )

  await goto('/profile', { waitUntil: 'hydration' })

  await expect(visibleNav(page).getByRole('link', { name: 'Log' })).toBeHidden()

  await page.getByRole('radio', { name: /calories and weight/i }).click()
  await page.getByRole('button', { name: /save profile/i }).click()

  await expect(
    visibleNav(page).getByRole('link', { name: 'Log' }),
  ).toBeVisible()

  // And Today is the full dashboard again, reached by navigation rather than a
  // reload — the shell's state moved, not a fresh boot's.
  await visibleNav(page).getByRole('link', { name: 'Today' }).click()

  await expect(page.getByText('0 / 2400 kcal')).toBeVisible()

  // Foods and Check came back too, wherever this viewport keeps the overflow.
  await withOverflowNav(page, async (nav) => {
    await expect(nav.getByRole('link', { name: 'Foods' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Check' })).toBeVisible()
  })
})
