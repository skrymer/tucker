import { test, expect } from '@nuxt/test-utils/playwright'

// F5 slice A smoke: the lazy catch-up cadence. When the latest WeeklyReview has
// aged a week, loading /today fires exactly one fresh review snapped to the
// client's local today, and the dashboard's Calorie Budget reflects it. No
// mocks on /api — only the browser clock is mocked, to stand a week in the
// future without waiting one.
//
// A WeeklyReview is irreversible (no DELETE), so — like the setup-banner smoke —
// this can't tear its review down. Instead it drives the cadence forward: read
// the current latest review, advance the clock a week past it, load /today, and
// assert a new review fired on the mocked day. Each run marches the latest
// review date forward by a week (harmless; a same-day reload never re-fires),
// so there is no per-run data to clean up.
const API = 'http://localhost:8080/api'

/** An ISO `yyyy-mm-dd` date shifted by whole days, in UTC to dodge DST. */
function isoPlusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

test('loading Today a week on fires a catch-up review and the budget reflects it', async ({
  page,
  goto,
  request,
}) => {
  // Ensure a review exists to age. On a fresh DB, complete setup the way a real
  // install does — profile, a weight reading, then an active goal, which
  // auto-fires the first review.
  if (!(await request.get(`${API}/weekly-review`)).ok()) {
    const today = new Date().toLocaleDateString('en-CA')
    await request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    })
    await request.post(`${API}/weight`, {
      data: { date: today, weightKg: 85 },
    })
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
  const dueDay = isoPlusDays(before.reviewedOn, 7)

  // Stand a week after the last review so /today's summary query is due. Local
  // noon keeps `new Date().toLocaleDateString('en-CA')` on `dueDay` regardless
  // of the runner's timezone.
  await page.clock.install({ time: new Date(`${dueDay}T12:00:00`) })

  await goto('/', { waitUntil: 'hydration' })

  // The dashboard shows a real Calorie Budget, not the no-budget fallback.
  await expect(page.getByText(/No budget yet/)).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Calories', level: 2 }),
  ).toBeVisible()

  // The catch-up ran on the summary read: the latest review snapped to today.
  await expect
    .poll(
      async () =>
        (await (await request.get(`${API}/weekly-review`)).json()).reviewedOn,
    )
    .toBe(dueDay)

  // And the budget on the dashboard is the figure from that fresh review.
  const after = await (await request.get(`${API}/weekly-review`)).json()
  await expect(
    page.getByText(`${Math.round(after.calorieBudgetKcal)} kcal`),
  ).toBeVisible()
})
