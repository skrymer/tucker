import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { isoShiftDays, todayIso } from '../support/date'
import { timelineLine } from '../support/weight-timeline'

// A Weight Timeline against the real backend. Seeds readings — and, for the
// second test, a log and two Weekly Reviews — over the API, asserts what the
// endpoint draws (the trend, the Budget in force on each day and the days with
// no Entry are the backend's alone, ADR 0002), then reads the same figures back
// off `/review`. The per-test reset wipes the seed, so there is no cleanup.
const API = 'http://localhost:8080/api'

/** How many days of readings each test seeds, which outruns the 28-day window. */
const HISTORY = 40

type TimelineDay = {
  date: string
  weightKg: number | null
  trendKg: number
  caloriesKcal: number | null
  calorieBudgetKcal: number | null
  trajectoryKg: number | null
}

async function weighIn(
  request: APIRequestContext,
  on: string,
  weightKg: number,
  today: string,
) {
  const saved = await request.post(`${API}/weight`, {
    data: { date: on, weightKg, clientToday: today },
  })
  expect(saved.status()).toBe(200)
}

async function timeline(
  request: APIRequestContext,
  days: number,
  today: string,
) {
  const to = today
  const from = isoShiftDays(to, -(days - 1))
  const response = await request.get(
    `${API}/weight-timeline?from=${from}&to=${to}`,
  )
  expect(response.status()).toBe(200)
  return (await response.json()) as {
    from: string
    to: string
    days: TimelineDay[]
    loggedDays: number | null
  }
}

/** Forty days of daily weighing, half a kilo a week off, skipping [skipped]. */
async function fortyDaysOnTheScale(
  request: APIRequestContext,
  today: string,
  skipped: string,
) {
  for (let back = HISTORY - 1; back >= 0; back--) {
    const on = isoShiftDays(today, -back)
    if (on === skipped) continue
    await weighIn(
      request,
      on,
      Number((82 - (HISTORY - 1 - back) * 0.05).toFixed(1)),
      today,
    )
  }
}

async function ate(request: APIRequestContext, on: string, calories: number) {
  const logged = await request.post(`${API}/entries/estimated`, {
    data: { date: on, label: 'dinner', calories, protein: 40 },
  })
  expect(logged.status()).toBe(201)
}

test('the timeline draws the readings behind the trend, and widens to 90 days', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const SKIPPED = isoShiftDays(today, -10)

  // One day missed inside the 28-day window — the day that must reach the chart
  // as an absence. No Profile is seeded, and the intake half is withheld only from
  // a User who has turned Calorie Tracking *off*, so these days carry it — every
  // one of them unlogged.
  await fortyDaysOnTheScale(request, today, SKIPPED)

  const fourWeeks = await timeline(request, 28, today)
  expect(fourWeeks.from).toBe(isoShiftDays(today, -27))
  expect(fourWeeks.days).toHaveLength(28)
  expect(
    fourWeeks.days.find((day) => day.date === SKIPPED)?.weightKg,
  ).toBeNull()

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: 'Your weight' })
  await expect(section.getByRole('listitem')).toHaveCount(28)
  // The figures on screen are the ones the endpoint drew — the trend is smoothed
  // over the User's whole history by the backend and never re-derived here.
  await expect(
    section.getByText(timelineLine(fourWeeks.days.at(-1)!, true)),
  ).toBeAttached()
  await expect(
    section.getByText(
      timelineLine(fourWeeks.days.find((d) => d.date === SKIPPED)!, true),
    ),
  ).toBeAttached()

  await section.getByRole('tab', { name: '90 days' }).click()

  // Cut to where the readings start rather than padded back ninety days.
  const threeMonths = await timeline(request, 90, today)
  expect(threeMonths.from).toBe(isoShiftDays(today, -(HISTORY - 1)))
  await expect(section.getByRole('listitem')).toHaveCount(HISTORY)
  await expect(
    section.getByText(timelineLine(threeMonths.days[0]!, true)),
  ).toBeAttached()
})

test('a weight-only User is shown the plan they set, and none once they drop it', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const SET_ON = isoShiftDays(today, -14)

  await request.put(`${API}/profile`, {
    data: {
      sex: 'MALE',
      birthDate: '1990-06-15',
      heightCm: 180,
      tracksCalories: false,
    },
  })
  // The skipped day sits outside the 28-day window: this test is about the plan.
  await fortyDaysOnTheScale(request, today, isoShiftDays(today, -35))

  const goal = await request.post(`${API}/goal`, {
    data: {
      startedOn: SET_ON,
      targetWeightKg: 76,
      rateKgPerWeek: 0.5,
      clientToday: today,
    },
  })
  expect(goal.status()).toBe(201)
  // Never sent: the backend derives it as the Trend Weight standing on the start
  // date (ADR 0016), which is what the plan is anchored on.
  const { startWeightKg } = (await goal.json()) as { startWeightKg: number }

  const drawn = await timeline(request, 28, today)
  const dayOn = (date: string) => drawn.days.find((day) => day.date === date)!
  // No intake half at all, and the plan in its place (ADR 0029).
  expect(drawn.loggedDays).toBeNull()
  // Nothing on a day the Goal did not yet cover.
  expect(dayOn(isoShiftDays(today, -15)).trajectoryKg).toBeNull()
  expect(dayOn(SET_ON).trajectoryKg).toBeCloseTo(startWeightKg, 5)
  // A fortnight at half a kilo a week is a kilo down.
  expect(dayOn(today).trajectoryKg!).toBeCloseTo(startWeightKg - 1, 5)

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: 'Your weight' })
  await expect(section.getByText('Plan', { exact: true })).toBeVisible()
  // The chart is aria-hidden, so this line is where the plan is readable — and it
  // is the endpoint's own figure, never re-derived here.
  await expect(
    section.getByText(timelineLine(dayOn(today), false)),
  ).toBeAttached()

  // Maintenance Mode: Tucker defends no target weight (ADR 0008), so dropping the
  // Goal leaves the plain weight timeline rather than a plan with nothing behind it.
  const dropped = await request.delete(
    `${API}/goal?clientToday=${encodeURIComponent(today)}`,
  )
  expect(dropped.status()).toBe(204)

  const plain = await timeline(request, 28, today)
  expect(plain.days.every((day) => day.trajectoryKg === null)).toBe(true)

  await page.reload()

  await expect(
    section.getByRole('heading', { name: 'Your weight' }),
  ).toBeVisible()
  await expect(section.getByText('Plan', { exact: true })).toBeHidden()
})

test('each day is drawn against the Budget in force on it, and an unlogged one is marked', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const NEVER_WEIGHED = isoShiftDays(today, -20)
  const NEVER_LOGGED = isoShiftDays(today, -3)
  const FIRST_REVIEW = isoShiftDays(today, -21)

  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  await fortyDaysOnTheScale(request, today, NEVER_WEIGHED)

  // A review three weeks back sets the Budget the days after it were read
  // against; there is no Goal yet, so it is Maintenance itself (ADR 0008).
  // Minted by reading that day's summary, which is what runs a due review —
  // `POST /api/weekly-review` refuses a clientToday more than a day off the
  // server's (ADR 0014), so a dated one cannot be asked for directly.
  const opened = await request.get(`${API}/summary?date=${FIRST_REVIEW}`)
  expect(opened.status()).toBe(200)

  // Six of the last seven days logged, one of them well over.
  for (const back of [6, 5, 4, 2, 1, 0]) {
    const on = isoShiftDays(today, -back)
    await ate(request, on, back === 6 ? 3000 : 1500)
  }

  // A Goal recomputes *today's* review at a deficit, which is the step the
  // Budget line has to draw: the days before it keep the earlier figure.
  const goal = await request.post(`${API}/goal`, {
    data: {
      startedOn: today,
      startWeightKg: 80,
      targetWeightKg: 76,
      rateKgPerWeek: 0.5,
      clientToday: today,
    },
  })
  expect(goal.status()).toBe(201)

  const drawn = await timeline(request, 28, today)
  const dayOn = (date: string) => drawn.days.find((day) => day.date === date)!
  expect(drawn.loggedDays).toBe(6)
  // Absent, never zero: a floor-height bar would read as a day of eating nothing.
  expect(dayOn(NEVER_LOGGED).caloriesKcal).toBeNull()
  // And the Budget spans that day rather than lapsing over it.
  // The step: today is read against the Goal's deficit, the days before it are
  // read against the Maintenance the earlier review published.
  const held = dayOn(FIRST_REVIEW).calorieBudgetKcal!
  expect(held).toBeGreaterThan(0)
  // Named rather than compared to its neighbour, which `null === null` satisfies.
  expect(dayOn(NEVER_LOGGED).calorieBudgetKcal).toBe(held)
  expect(dayOn(today).calorieBudgetKcal!).toBeLessThan(held)
  // Before the first review there was no Budget at all to be read against.
  expect(dayOn(isoShiftDays(today, -27)).calorieBudgetKcal).toBeNull()
  // And it holds flat from the review that set it until the one that moved it.
  expect(dayOn(isoShiftDays(today, -1)).calorieBudgetKcal).toBe(held)

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: 'Your weight' })
  // The chart is aria-hidden, so these lines are where its figures are readable —
  // and they are the endpoint's own, never re-derived here.
  await expect(
    section.getByText(timelineLine(dayOn(today), true)),
  ).toBeAttached()
  await expect(
    section.getByText(timelineLine(dayOn(FIRST_REVIEW), true)),
  ).toBeAttached()
  await expect(
    section.getByText(timelineLine(dayOn(NEVER_LOGGED), true)),
  ).toBeAttached()
  await expect(section.getByText('6 of 28 days logged')).toBeVisible()
  await expect(section.getByText('Calories')).toBeVisible()
  await expect(section.getByText('Budget', { exact: true })).toBeVisible()
})
