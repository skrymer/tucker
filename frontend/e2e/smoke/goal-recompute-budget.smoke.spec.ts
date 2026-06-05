import { test, expect } from './support/smoke-test'

// Issue #61 smoke: replacing a Goal force-recomputes *today's* Weekly Review, so
// a steeper rate (a larger daily deficit) moves the Calorie Budget immediately —
// it no longer waits up to a week for the next review cadence. No /api mocks;
// this proves the wired UI → API → DB stack.
//
// Prerequisites (a profile + a weight reading) are seeded via the API as
// idempotent upserts. The baseline Goal is set via the API to fix today's first
// review; the *replacement* — the action under test — goes through the /profile
// Goal form. Goals are replacement-only (no DELETE) and each run replaces the
// active Goal, so the persistent docker volume stays clean across runs.
//
// We assert on *today's* review via /weekly-review/history rather than on the
// dashboard's budget number: the daily summary surfaces the single latest review
// by date, and the clock-mocking smokes (budget-change-banner, catch-up) leave
// future-dated reviews in the shared volume that would mask today's. Comparing
// today's own review before/after is the deterministic proof of immediacy; the
// dashboard is still exercised to confirm it renders the wired budget.
const API = 'http://localhost:8080/api'

interface ReviewRow {
  reviewedOn: string
  calorieBudgetKcal: number
}

async function budgetForReviewOn(
  request: {
    get: (
      url: string,
    ) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }>
  },
  date: string,
): Promise<number | null> {
  const res = await request.get(`${API}/weekly-review/history`)
  if (!res.ok()) return null
  const all = (await res.json()) as ReviewRow[]
  return all.find((r) => r.reviewedOn === date)?.calorieBudgetKcal ?? null
}

test("replacing a goal recomputes today's budget immediately for the new deficit", async ({
  page,
  goto,
  request,
}) => {
  const today = new Date().toLocaleDateString('en-CA')

  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  await request.post(`${API}/weight`, { data: { date: today, weightKg: 85 } })

  // Baseline Goal at a gentle rate; its deficit fixes today's first review.
  const baseline = await request.post(`${API}/goal`, {
    data: {
      startedOn: today,
      startWeightKg: 85,
      targetWeightKg: 80,
      rateKgPerWeek: 0.5,
    },
  })
  expect(baseline.status()).toBe(201)

  const budgetBefore = await budgetForReviewOn(request, today)
  expect(budgetBefore).toEqual(expect.any(Number))

  // Replace the Goal with a steeper rate through the /profile UI.
  await goto('/profile', { waitUntil: 'hydration' })
  const goal = page.getByRole('region', { name: /^goal$/i })
  await goal.getByRole('button', { name: /set a new goal/i }).click()
  await goal.getByLabel(/target weight/i).fill('80')
  await goal.getByLabel(/rate/i).fill('0.8')
  await goal.getByRole('button', { name: /^set goal$/i }).click()
  await expect(goal.getByText('0.8 kg/week')).toBeVisible()

  // The steeper deficit (0.8 vs 0.5 kg/week ≈ 330 kcal/day) lands on today's
  // review right away — same maintenance, larger deficit, lower Budget.
  await expect
    .poll(() => budgetForReviewOn(request, today))
    .toBeLessThan(budgetBefore!)

  const budgetAfter = (await budgetForReviewOn(request, today))!
  const extraDeficit = ((0.8 - 0.5) * 7700) / 7
  expect(Math.abs(budgetBefore! - budgetAfter - extraDeficit)).toBeLessThan(1)

  // The dashboard renders a wired Calorie Budget (no setup nudge).
  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText(/\d+ \/ \d+ kcal/)).toBeVisible()
  await expect(
    page.getByText(/finish setup to see your calorie budget/i),
  ).toHaveCount(0)
})
