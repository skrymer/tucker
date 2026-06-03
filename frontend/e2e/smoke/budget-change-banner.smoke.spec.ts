import { test, expect } from '@nuxt/test-utils/playwright'

// F5 slice B smoke: the budget-change banner on /today. When a weekly review
// moves the Calorie Budget or Protein Floor, /today shows a persistent,
// dismissible banner naming old → new figures and linking to the review. No
// /api mocks — only the browser clock is mocked, to stand a week on and fire
// the lazy catch-up review.
//
// To make the latest review *differ* from the one before it, we nudge the
// weight reading before the catch-up runs: the Protein Floor is 2 g/kg of the
// Trend Weight, so a different weight yields a different floor. The nudge
// toggles around the current trend, so every run produces a genuinely changed
// review and the test stays idempotent against the persistent volume. A
// WeeklyReview is irreversible (no DELETE) — like the catch-up smoke this
// marches forward — but the weight nudge is restored afterwards.
const API = 'http://localhost:8080/api'

/** An ISO `yyyy-mm-dd` date shifted by whole days, in UTC to dodge DST. */
function isoPlusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

test('a changed weekly review raises a dismissible budget-change banner', async ({
  page,
  goto,
  request,
}) => {
  const today = new Date().toLocaleDateString('en-CA')

  // Ensure a first review exists to change *from*. A fresh DB has none, so
  // complete setup the way a real install does — profile, a weight reading,
  // then an active goal, which auto-fires the first review.
  if (!(await request.get(`${API}/weekly-review`)).ok()) {
    await request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    })
    await request.post(`${API}/weight`, { data: { date: today, weightKg: 85 } })
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

  const before = await (await request.get(`${API}/weekly-review`)).json()

  // Remember the current reading so we can restore it, then nudge the weight so
  // the next review's Protein Floor differs from `before`. Toggling around the
  // current trend keeps the change real on every run.
  const origWeight = await (await request.get(`${API}/weight/latest`)).json()
  const nudgeKg = before.trendWeightKg > 83 ? 78 : 92
  await request.post(`${API}/weight`, {
    data: { date: today, weightKg: nudgeKg },
  })

  // Stand a week past the last review so /today's summary read is due, and fire
  // a fresh catch-up review off the nudged weight.
  const dueDay = isoPlusDays(before.reviewedOn, 7)
  await page.clock.install({ time: new Date(`${dueDay}T12:00:00`) })
  await goto('/', { waitUntil: 'hydration' })

  // The catch-up ran on the summary read: the latest review snapped to today.
  await expect
    .poll(
      async () =>
        (await (await request.get(`${API}/weekly-review`)).json()).reviewedOn,
    )
    .toBe(dueDay)
  const after = await (await request.get(`${API}/weekly-review`)).json()
  expect(after.proteinFloorG).not.toBe(before.proteinFloorG)

  // The banner names old → new figures and links through to the weekly review.
  const r = (n: number) => Math.round(n)
  await expect(
    page.getByText(
      `Calorie Budget: ${r(before.calorieBudgetKcal)} → ${r(after.calorieBudgetKcal)} kcal`,
    ),
  ).toBeVisible()
  await expect(
    page.getByText(
      `Protein Floor: ${r(before.proteinFloorG)} → ${r(after.proteinFloorG)} g`,
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /see your review/i }),
  ).toHaveAttribute('href', '/review')

  // Dismissing it hides it, and it stays hidden across a reload — the dismissal
  // is persisted in localStorage, keyed by the review id.
  await page.getByRole('button', { name: /close/i }).click()
  await expect(page.getByText(/Calorie Budget:/)).toHaveCount(0)
  await goto('/', { waitUntil: 'hydration' })
  await expect(page.getByText(/Calorie Budget:/)).toHaveCount(0)

  // Restore the weight reading we nudged.
  await request.post(`${API}/weight`, {
    data: { date: origWeight.measuredOn, weightKg: origWeight.weightKg },
  })
})
