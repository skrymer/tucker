import { expect, test } from './support/test'
import {
  mockFoods,
  mockGoalProgress,
  mockProfile,
  mockSummary,
  mockWeightApi,
} from './support/mock-api'
import { goalProgress } from '../test/goal-fixtures'
import { denyCamera } from './support/fake-camera'
import { visibleNav } from './support/nav'

// Tucker takes the shape of the Calorie Tracking choice. With it off there is no
// log half — no Foods or Check tab, no day summary, no budget-change banner and
// no Log-entry action — and the Goal is a ring.

const WEIGHT_ONLY = {
  sex: 'MALE',
  birthDate: '1990-06-15',
  heightCm: 180,
  tracksCalories: false,
}

/** A day whose Budget the backend still derives; the client is what hides it. */
const DAY = {
  date: '2026-08-24',
  caloriesConsumed: 0,
  proteinConsumed: 0,
  estimatedCalorieShare: 0,
  calorieBudget: 2400,
  proteinFloor: 170,
  caloriesRemaining: 2400,
  dayStatus: null,
  trendWeightKg: 86,
  entries: [],
  budgetChange: {
    reviewId: 4,
    previousBudgetKcal: 2200,
    newBudgetKcal: 2400,
    previousFloorG: 165,
    newFloorG: 170,
  },
}

const PROGRESS = goalProgress({ paceStatus: 'on-pace' })

test.describe('with Calorie Tracking off', () => {
  test.beforeEach(async ({ page }) => {
    await mockProfile(page, WEIGHT_ONLY)
    await mockSummary(page, DAY)
    // No reading for *today*, whatever today is where this runs: the tile then
    // has one resting shape rather than two, and the snapshot keeps meaning what
    // it meant when it was taken. `todayIso()` is deliberately UTC (see
    // e2e/support/date.ts) while the page compares against the *local* day, so a
    // fixture built from it would disagree with the app for part of every day
    // outside UTC.
    await mockWeightApi(page, {
      id: 1,
      measuredOn: '2020-01-01',
      weightKg: 86.2,
    })
    await mockGoalProgress(page, PROGRESS)
  })

  test('the navigation offers Today, Review and Profile only', async ({
    page,
    goto,
  }) => {
    await goto('/', { waitUntil: 'hydration' })

    await expect(visibleNav(page)).toMatchAriaSnapshot()
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
    await mockFoods(page, [])

    await goto('/foods', { waitUntil: 'hydration' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Foods' }),
    ).toBeVisible()
    await expect(
      visibleNav(page).getByRole('link', { name: 'Foods' }),
    ).toBeHidden()
  })

  test('the Check tab is still reachable by a direct link', async ({
    page,
    goto,
  }) => {
    // Stubbed like every other /check spec, so the route is exercised without
    // reaching for headless Chromium's absent camera.
    await denyCamera(page)

    await goto('/check', { waitUntil: 'hydration' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Check' }),
    ).toBeVisible()
  })
})

test('turning Calorie Tracking back on restores the log half without a reload', async ({
  page,
  goto,
}) => {
  await mockSummary(page, DAY)
  await mockWeightApi(page, { id: 1, measuredOn: '2020-01-01', weightKg: 86.2 })
  let profile: Record<string, unknown> = { ...WEIGHT_ONLY }
  await page.route('**/api/profile', (route) => {
    const method = route.request().method()
    if (method === 'GET') return route.fulfill({ json: profile })
    if (method === 'PUT') {
      profile = { ...profile, ...route.request().postDataJSON() }
      return route.fulfill({ json: profile })
    }
    return route.fallback()
  })

  await goto('/profile', { waitUntil: 'hydration' })

  await expect(
    visibleNav(page).getByRole('link', { name: 'Foods' }),
  ).toBeHidden()

  await page.getByRole('radio', { name: /calories and weight/i }).click()
  await page.getByRole('button', { name: /save profile/i }).click()

  await expect(
    visibleNav(page).getByRole('link', { name: 'Foods' }),
  ).toBeVisible()
  await expect(
    visibleNav(page).getByRole('link', { name: 'Check' }),
  ).toBeVisible()

  // And Today is the full dashboard again, reached by navigation rather than a
  // reload — the shell's state moved, not a fresh boot's.
  await visibleNav(page).getByRole('link', { name: 'Today' }).click()

  await expect(page.getByText('0 / 2400 kcal')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log entry' })).toBeVisible()
})
