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
// We assert on the *latest* review via /weekly-review/history, not the dashboard
// budget number: the dashboard only proves rendering, this proves the recompute.
// Reading the latest review (rather than matching an exact client-today date) is
// deliberately robust to any runner-vs-backend calendar-day skew: after the
// per-test reset (#70) the only review in play is the one the Goal change just
// recomputed, so "latest" *is* today's review — without the test having to agree
// with the backend on what "today" is. (Both clocks are pinned to UTC anyway —
// see docker-compose.smoke.yml + the test:smoke script — this keeps the assertion
// correct even if that ever regresses.) The dashboard is still exercised below to
// confirm it renders the wired budget.
const API = 'http://localhost:8080/api'

interface ReviewRow {
  reviewedOn: string
  calorieBudgetKcal: number
}

/** The Calorie Budget of the most recent Weekly Review, or null if none exists. */
async function latestReviewBudget(request: {
  get: (
    url: string,
  ) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }>
}): Promise<number | null> {
  const res = await request.get(`${API}/weekly-review/history`)
  if (!res.ok()) return null
  const all = (await res.json()) as ReviewRow[]
  if (all.length === 0) return null
  const latest = all.reduce((a, b) => (a.reviewedOn >= b.reviewedOn ? a : b))
  return latest.calorieBudgetKcal ?? null
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

  const budgetBefore = await latestReviewBudget(request)
  expect(
    budgetBefore,
    "creating a Goal should recompute today's review with a Calorie Budget",
  ).toEqual(expect.any(Number))

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
    .poll(() => latestReviewBudget(request))
    .toBeLessThan(budgetBefore!)

  const budgetAfter = (await latestReviewBudget(request))!
  const extraDeficit = ((0.8 - 0.5) * 7700) / 7
  expect(Math.abs(budgetBefore! - budgetAfter - extraDeficit)).toBeLessThan(1)

  // The dashboard renders a wired Calorie Budget (no setup nudge).
  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText(/\d+ \/ \d+ kcal/)).toBeVisible()
  await expect(
    page.getByText(/finish setup to see your calorie budget/i),
  ).toHaveCount(0)
})
