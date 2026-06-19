import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'

// F5 slice D smoke: the Weekly Review ledger on /review, end-to-end against the
// real backend. No /api mocks — only the browser clock is mocked, to stand a
// week on and fire the lazy catch-up review.
//
// Why catch-up rather than the "Run review now" button drives the new review
// here: the manual POST runs `runReview(LocalDate.now())` on the *server* clock
// and is guarded against a duplicate same-day review, and a WeeklyReview is
// irreversible (no DELETE). On a fresh same-day volume the setup review already
// owns today, so the button can't mint a second one deterministically. The
// cadence read *is* a review run, so we drive it the proven slice-B way: nudge
// the weight, stand a week on, load /today to fire one fresh catch-up review,
// then assert the ledger renders that new row — its figures, its delta vs the
// previous review, and its basis badge — newest-first, as a table on desktop
// and cards on phone. The button's presence is asserted; the nudge is restored.
const API = 'http://localhost:8080/api'

test('the ledger lists each review newest-first with its delta and basis badge', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // Ensure a first review exists to delta *from*. A fresh DB has none, so
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

  // Remember the current reading to restore it, then nudge the weight so the next
  // review's trend (and the trend-derived protein floor) differ from `before`,
  // giving the ledger a visible delta. With no logged intake the Budget itself
  // holds (basis HELD, ADR 0018), so the trend is what moves the deltas here.
  // Toggling around the current trend keeps the change real on every run.
  const origWeight = await (await request.get(`${API}/weight/latest`)).json()
  const nudgeKg = before.trendWeightKg > 83 ? 78 : 92
  await request.post(`${API}/weight`, {
    data: { date: today, weightKg: nudgeKg },
  })

  // Stand a week past the last review so /today's summary read is due, and fire
  // a fresh catch-up review off the nudged weight.
  const dueDay = isoShiftDays(before.reviewedOn, 7)
  await page.clock.install({ time: new Date(`${dueDay}T12:00:00Z`) })
  await goto('/', { waitUntil: 'hydration' })

  // The catch-up ran on the summary read: the latest review snapped to today.
  await expect
    .poll(
      async () =>
        (await (await request.get(`${API}/weekly-review`)).json()).reviewedOn,
    )
    .toBe(dueDay)
  const after = await (await request.get(`${API}/weekly-review`)).json()

  // What the backend computed is what the newest ledger row must render. The
  // precise delta arithmetic is pinned by the unit/component tests; here we
  // prove the wiring — the new figure shows, deltas and badges render, and the
  // responsive split is honoured. (A heavily-smoothed volume can occasionally
  // mint a review equal to its predecessor, so the new row's own delta isn't a
  // reliable assertion — but the accumulated history always carries deltas.)
  const newBudget = String(Math.round(after.calorieBudgetKcal))
  // The basis lives only in the review note; the badge mirrors it. With no logged
  // entries the catch-up holds the prior maintenance (basis HELD) rather than
  // re-seeding (ADR 0018), so the mapping is tri-state.
  const note: string = after.note ?? ''
  const expectedBadge = note.includes('ADAPTIVE')
    ? 'Adaptive'
    : note.includes('HELD')
      ? 'Held'
      : 'Seed'

  await goto('/review', { waitUntil: 'hydration' })

  // The newest review's Calorie Budget headline and basis badge render (both
  // viewports), plus the manual "Run review now" trigger.
  await expect(page.getByText(newBudget, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(expectedBadge).first()).toBeVisible()
  await expect(
    page.getByRole('button', { name: /run review now/i }),
  ).toBeVisible()

  // The responsive split: a table on desktop, stacked cards on phone — switched
  // by useIsDesktop() at the 1024px breakpoint, not CSS-hidden.
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 1024
  if (isDesktop) {
    await expect(page.getByRole('table')).toBeVisible()
    // Deltas render as signed muted text versus the previous review. The trend and
    // protein-floor columns moved with the nudge, so the table carries deltas even
    // though the Budget holds under no-intake (ADR 0018).
    await expect(
      page.getByText(/versus the previous review/i).first(),
    ).toBeAttached()
  } else {
    await expect(page.getByRole('table')).toHaveCount(0)
    // The newest review renders as a card (a listitem) with its figure and badge.
    // The phone card shows only the Budget delta, which a held review hasn't moved.
    const card = page
      .getByRole('listitem')
      .filter({ hasText: newBudget })
      .first()
    await expect(card).toBeVisible()
    await expect(card.getByText(expectedBadge)).toBeVisible()
  }

  // Restore the weight reading we nudged.
  await request.post(`${API}/weight`, {
    data: { date: origWeight.measuredOn, weightKg: origWeight.weightKg },
  })
})
