import { expect, test } from './support/test'
import {
  mockIntakeBreakdown,
  mockMicronutrientIntake,
  mockNoActiveGoal,
  mockProfile,
  mockReviewHistory,
  mockWeightTimeline,
  mockWeightTimelineByWindow,
  recordWindows,
} from './support/mock-api'
import { isoShiftDays, localTodayIso } from './support/date'
import { timelineLine } from './support/weight-timeline'

// What a User's weight did over the trailing 28 or 90 days: every Weight
// Measurement in the window as a point, the Trend Weight as the line through
// them (ADR 0029).

/**
 * A window of [days] ending on the browser's *local* today — the day the client
 * stamps the request with (ADR 0014) — steady at 80 kg but for its first day,
 * which carries [openingKg] so one window's figures are told from the other's.
 */
function aTimeline(days: number, openingKg: number) {
  const to = localTodayIso()
  const from = isoShiftDays(to, -(days - 1))
  return {
    from,
    to,
    days: Array.from({ length: days }, (_, index) => ({
      date: isoShiftDays(from, index),
      weightKg: index === 0 ? openingKg : 80,
      trendKg: index === 0 ? openingKg : 80,
    })),
  }
}

const FOUR_WEEKS = aTimeline(28, 88)
const THREE_MONTHS = aTimeline(90, 95)

/**
 * The same four weeks with an intake half: one Budget throughout, the opening day
 * over it, the second never logged, the rest comfortably under.
 */
const BUDGET_KCAL = 1800
const TRACKED = {
  ...FOUR_WEEKS,
  loggedDays: FOUR_WEEKS.days.length - 1,
  days: FOUR_WEEKS.days.map((day, index) => {
    const caloriesKcal = index === 1 ? null : index === 0 ? 2100 : 1700
    return {
      ...day,
      caloriesKcal,
      calorieBudgetKcal: BUDGET_KCAL,
      // Stated by the backend, never derived here (ADR 0002).
      overBudget: caloriesKcal == null ? null : caloriesKcal > BUDGET_KCAL,
    }
  }),
}

/** The line the sr-only list carries for a window's opening day. */
function openingLine(timeline: ReturnType<typeof aTimeline>) {
  return timelineLine(timeline.days[0]!, false)
}

test.beforeEach(async ({ page }) => {
  await mockNoActiveGoal(page)
  await mockIntakeBreakdown(page)
  await mockMicronutrientIntake(page)
  await mockReviewHistory(page, [])
})

test('opens on the trailing 28 days, and states every day it drew', async ({
  page,
  goto,
}) => {
  const asked = await mockWeightTimelineByWindow(page, () => FOUR_WEEKS)

  await goto('/review', { waitUntil: 'hydration' })

  await expect(page.getByRole('heading', { name: 'Your weight' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '28 days' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(asked).toHaveLength(1)
  expect(asked[0]!.to).toBe(localTodayIso())
  expect(asked[0]!.from).toBe(isoShiftDays(asked[0]!.to, -27))
  // The chart is aria-hidden, so this list is where its figures are readable.
  await expect(page.getByText(openingLine(FOUR_WEEKS))).toBeAttached()
})

test('switching to 90 days asks for the wider window, and back again', async ({
  page,
  goto,
}) => {
  const asked = await mockWeightTimelineByWindow(page, (from, to) =>
    from === isoShiftDays(to, -27) ? FOUR_WEEKS : THREE_MONTHS,
  )

  await goto('/review', { waitUntil: 'hydration' })
  await expect(page.getByText(openingLine(FOUR_WEEKS))).toBeAttached()

  await page.getByRole('tab', { name: '90 days' }).click()

  await expect(page.getByText(openingLine(THREE_MONTHS))).toBeAttached()
  await expect(page.getByText(openingLine(FOUR_WEEKS))).not.toBeAttached()
  expect(asked).toHaveLength(2)
  expect(asked[1]!.to).toBe(asked[0]!.to)
  expect(asked[1]!.from).toBe(isoShiftDays(asked[1]!.to, -89))

  // A toggle that only works one way strands the User on the wider window.
  await page.getByRole('tab', { name: '28 days' }).click()

  await expect(page.getByText(openingLine(FOUR_WEEKS))).toBeAttached()
  expect(asked).toHaveLength(3)
  expect(asked[2]!.from).toBe(isoShiftDays(asked[2]!.to, -27))
})

test('a failed load retries the window still selected, not the one it opened on', async ({
  page,
  goto,
}) => {
  // Held rather than spent on the first refusal: ofetch retries a failed GET of
  // its own accord, so a one-shot failure is answered by the retry nobody asked
  // for and the error state never appears.
  let refusing = false
  const asked = await recordWindows(
    page,
    '**/api/weight-timeline**',
    (from, to, route) =>
      refusing
        ? route.fulfill({ status: 500, json: { message: 'boom' } })
        : route.fulfill({
            json: from === isoShiftDays(to, -27) ? FOUR_WEEKS : THREE_MONTHS,
          }),
  )

  await goto('/review', { waitUntil: 'hydration' })
  await expect(page.getByText(openingLine(FOUR_WEEKS))).toBeAttached()

  refusing = true
  await page.getByRole('tab', { name: '90 days' }).click()

  await expect(
    page.getByRole('heading', { name: "Couldn't load your weight" }),
  ).toBeVisible()

  refusing = false
  await page.getByRole('button', { name: 'Retry' }).click()

  // The wider window, not the one the page opened on: a retry that reverted
  // would answer a question the User had already left.
  await expect(page.getByText(openingLine(THREE_MONTHS))).toBeAttached()
  const retried = asked.at(-1)!
  expect(retried.from).toBe(isoShiftDays(retried.to, -89))
})

test('under a fortnight of readings there is no timeline, and no error where it would be', async ({
  page,
  goto,
}) => {
  await mockWeightTimeline(page)

  await goto('/review', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: 'Review', level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your weight' })).toBeHidden()
  await expect(
    page.getByRole('heading', { name: "Couldn't load your weight" }),
  ).toBeHidden()
})

test('each day states what it cost against the Budget, and an unlogged one says so', async ({
  page,
  goto,
}) => {
  await mockWeightTimeline(page, TRACKED)

  await goto('/review', { waitUntil: 'hydration' })

  // The chart is aria-hidden, so this list is where its figures are readable.
  await expect(
    page.getByText(timelineLine(TRACKED.days[0]!, true)),
  ).toBeAttached()
  await expect(
    page.getByText(timelineLine(TRACKED.days[1]!, true)),
  ).toBeAttached()
  // Scoped to the section: `/review` renders two other calorie cards, so a
  // page-wide match would not stay unambiguous.
  const section = page.getByRole('region', { name: 'Your weight' })
  // How far the bars can be trusted, measured off the window the response drew.
  await expect(section.getByText('27 of 28 days logged')).toBeVisible()
  // Neither calorie mark is identified by its colour alone.
  await expect(section.getByText('Calories')).toBeVisible()
  await expect(section.getByText('Budget', { exact: true })).toBeVisible()
})

test('the timeline is drawn with Calorie Tracking off, where the calorie sections are not', async ({
  page,
  goto,
}) => {
  await mockProfile(page, {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
    tracksCalories: false,
  })
  await mockWeightTimeline(page, FOUR_WEEKS)

  await goto('/review', { waitUntil: 'hydration' })

  await expect(page.getByRole('heading', { name: 'Your weight' })).toBeVisible()
  await expect(page.getByText(openingLine(FOUR_WEEKS))).toBeAttached()
  // Weight is the premise and intake the addition, so only the addition goes.
  await expect(
    page.getByRole('heading', { name: "What you're eating" }),
  ).toBeHidden()
  await expect(
    page.getByRole('heading', { name: 'Vitamins and minerals' }),
  ).toBeHidden()
  // And the intake half of the chart goes with them: absent server-side, so
  // there is nothing here to hide. The heading and the opening line asserted
  // above are what rule out the section having failed to render entirely.
  const section = page.getByRole('region', { name: 'Your weight' })
  await expect(section.getByText(/days logged/)).toBeHidden()
  await expect(section.getByText('Calories')).toBeHidden()
})

test('pointing at the chart reads out the day under the pointer', async ({
  page,
  goto,
}) => {
  await mockWeightTimeline(page, FOUR_WEEKS)

  await goto('/review', { waitUntil: 'hydration' })
  // Reached through the section rather than by a class: the chart is
  // `aria-hidden` and has no accessible surface of its own.
  const chart = page.getByRole('region', { name: 'Your weight' }).locator('svg')
  await expect(chart.first()).toBeVisible()

  await chart.first().hover({ position: { x: 120, y: 60 } })

  // Every day of this window but its first reads 80 kg, so a readout pinned to
  // any one day — the opening 88 kg, say — fails here rather than merely looking
  // well-shaped. Scoped to the section: the app shell carries a `status` too.
  await expect(
    page.getByRole('region', { name: 'Your weight' }).getByRole('status'),
  ).toHaveText(/^\d+ \w+ \d{4} · 80\.0 kg · trend 80\.0 kg$/)
})
