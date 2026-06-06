import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F4 slice 5 smoke: the setup banner on /today reflects the real
// `GET /api/summary` budget signal. No mocks.
//
// A WeeklyReview is irreversible — there's no DELETE — and `summary.calorieBudget`
// is non-null forever once one has run. So this test keys off whether a review
// already exists:
//   • Fresh DB (no review): the banner must be up. We then complete setup
//     through the API and run a review, which permanently moves the DB into a
//     "set up" state — exactly the state a real install ends in.
//   • Already set up (a prior run, or real use): the banner must be gone.
// Either branch asserts the budget→banner contract; the first run on a fresh
// volume leaves it set up, and every subsequent run is net-zero.
const API = 'http://localhost:8080/api'
const BANNER = /finish setup to see your calorie budget/i

test('the setup banner shows until a budget exists, then disappears', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  const review = await request.get(`${API}/weekly-review`)
  const alreadySetUp = review.ok()

  if (!alreadySetUp) {
    // Fresh install: no budget yet, so the banner is up and points at /profile.
    await goto('/', { waitUntil: 'hydration' })
    await expect(page.getByText(BANNER)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /finish setup/i }),
    ).toHaveAttribute('href', '/profile')

    // Complete setup the way a real install does: profile, a weight reading,
    // then an active goal. Setting the first goal auto-fires the weekly review
    // that yields the budget, so no manual review trigger is needed.
    const profile = await request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    })
    expect(profile.ok()).toBe(true)

    const weight = await request.post(`${API}/weight`, {
      data: { date: today, weightKg: 85 },
    })
    expect(weight.ok()).toBe(true)

    const goal = await request.post(`${API}/goal`, {
      data: {
        startedOn: today,
        startWeightKg: 85,
        targetWeightKg: 80,
        rateKgPerWeek: 0.5,
      },
    })
    expect(goal.status()).toBe(201)
  }

  // A review now exists, so the budget is non-null and the banner is gone.
  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText(BANNER)).toHaveCount(0)
  // Sanity-check we're looking at a rendered dashboard, not a blank page.
  await expect(
    page.getByRole('heading', { name: 'Today', level: 1 }),
  ).toBeVisible()
})
