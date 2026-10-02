import { expect, test } from './support/network'
import { isoShiftDays, localTodayIso } from './support/date'
import { timelineLine } from './support/weight-timeline'
import {
  intakeEvidence,
  planStartingOn,
  steadyDays,
  weightTimeline,
  withIntake,
  withPlan,
} from '../test/weight-timeline-fixtures'
import { goalInProgress } from '../test/mocks/handlers/goal'
import { profileOf, weightOnlyProfile } from '../test/mocks/handlers/profile'
import {
  weightTimelineByWidth,
  weightTimelineFails,
  weightTimelineOf,
} from '../test/mocks/handlers/weight-timeline'

// What a User's weight did over the trailing 28 or 90 days: every Weight
// Measurement in the window as a point, the Trend Weight as the line through
// them (ADR 0029).

/**
 * A window of [days] ending on the browser's *local* today — the day the client
 * stamps the request with (ADR 0014) — steady at 80 kg but for its first day,
 * which carries [openingKg] so one window's figures are told from the other's.
 */
function aTimeline(days: number, openingKg: number) {
  return weightTimeline({
    days: steadyDays(days, localTodayIso(), openingKg),
  })
}

const FOUR_WEEKS = aTimeline(28, 88)
const THREE_MONTHS = aTimeline(90, 95)

/**
 * The same four weeks with an intake half: one 1800 kcal Budget throughout, the
 * opening day over it, the second never logged, the rest comfortably under.
 */
const TRACKED = weightTimeline({
  days: withIntake(
    FOUR_WEEKS.days,
    FOUR_WEEKS.days.map((_, index) =>
      index === 1 ? null : index === 0 ? 2100 : 1700,
    ),
  ),
  evidence: intakeEvidence(FOUR_WEEKS.days.length - 1),
})

/**
 * The same four weeks for a weight-only User pursuing a Goal: the plan takes the
 * intake half's place, opening where the trend was and running half a kilo a week
 * below it, which stays within reach of the weights throughout.
 */
const PLANNED = weightTimeline({
  days: withPlan(
    FOUR_WEEKS.days,
    FOUR_WEEKS.days.map((_, index) => 88 - (index * 0.5) / 7),
  ),
})

/**
 * Four weeks of the same User falling behind: steady at 80 kg while the plan runs
 * a kilo a week below them, so it leaves the plot two kilos down and the rest of
 * it is off the bottom of the card.
 */
const STEADY = aTimeline(28, 80)
const BEHIND_PLAN = weightTimeline({
  days: withPlan(
    STEADY.days,
    STEADY.days.map((_, index) => 80 - index / 7),
  ),
})

/** The line the sr-only list carries for a window's opening day. */
function openingLine(timeline: ReturnType<typeof aTimeline>) {
  return timelineLine(timeline.days[0]!, false)
}

/**
 * Both windows, each answered only when it ends on the local day — so a page
 * asking about any other window meets the error state instead.
 */
const bothWindows = () =>
  weightTimelineByWidth(
    { 28: FOUR_WEEKS, 90: THREE_MONTHS },
    { today: localTodayIso() },
  )

test('opens on the trailing 28 days, and states every day it drew', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    weightTimelineByWidth({ 28: FOUR_WEEKS }, { today: localTodayIso() }),
  )

  await goto('/review', { waitUntil: 'hydration' })

  await expect(page.getByRole('heading', { name: 'Your weight' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '28 days' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  // The chart is aria-hidden, so this list is where its figures are readable.
  await expect(page.getByText(openingLine(FOUR_WEEKS))).toBeAttached()
})

test('switching to 90 days asks for the wider window, and back again', async ({
  page,
  goto,
  network,
}) => {
  network.use(bothWindows())

  await goto('/review', { waitUntil: 'hydration' })
  await expect(page.getByText(openingLine(FOUR_WEEKS))).toBeAttached()

  await page.getByRole('tab', { name: '90 days' }).click()

  await expect(page.getByText(openingLine(THREE_MONTHS))).toBeAttached()
  await expect(page.getByText(openingLine(FOUR_WEEKS))).not.toBeAttached()

  // A toggle that only works one way strands the User on the wider window.
  await page.getByRole('tab', { name: '28 days' }).click()

  await expect(page.getByText(openingLine(FOUR_WEEKS))).toBeAttached()
  await expect(page.getByText(openingLine(THREE_MONTHS))).not.toBeAttached()
})

test('a failed load retries the window still selected, not the one it opened on', async ({
  page,
  goto,
  network,
}) => {
  // Held rather than spent on the first refusal: ofetch retries a failed GET of
  // its own accord, so a one-shot failure is answered by the retry nobody asked
  // for and the error state never appears.
  let refusing = false
  network.use(
    weightTimelineFails(() => refusing),
    bothWindows(),
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
})

test('under a fortnight of readings there is no timeline, and no error where it would be', async ({
  page,
  goto,
  network,
}) => {
  network.use(weightTimelineOf(null))

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
  network,
}) => {
  network.use(weightTimelineOf(TRACKED))

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
  network,
}) => {
  // Maintenance Mode, so nothing is drawn beside the weight.
  network.use(profileOf(weightOnlyProfile), weightTimelineOf(FOUR_WEEKS))

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

test("with Calorie Tracking off the Goal's plan is drawn beside the weight", async ({
  page,
  goto,
  network,
}) => {
  network.use(
    profileOf(weightOnlyProfile),
    goalInProgress(),
    weightTimelineOf(PLANNED),
  )

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: 'Your weight' })
  await expect(section.getByText('Plan', { exact: true })).toBeVisible()
  // Drawn within reach, so nothing says it left the plot.
  await expect(section.getByText('Plan off chart')).toBeHidden()
  // The chart is aria-hidden, so the list is where the plan is readable at all.
  await expect(page.getByText(openingLine(PLANNED))).toBeAttached()
})

test('a plan that does not reach the window says so, rather than looking like Maintenance Mode', async ({
  page,
  goto,
  network,
}) => {
  // A Goal started on a device already into tomorrow, read on one whose window
  // closes today: no day carries a plan, which is exactly what Maintenance Mode
  // sends too. Only the named evidence tells the card which it is looking at.
  network.use(
    profileOf(weightOnlyProfile),
    goalInProgress(),
    weightTimelineOf({
      ...FOUR_WEEKS,
      evidence: planStartingOn(isoShiftDays(FOUR_WEEKS.to, 1)),
    }),
  )

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: 'Your weight' })
  await expect(section.getByText(/Your goal’s plan starts/)).toBeVisible()
  // And no key chip, which would name a stroke the chart is not drawing.
  await expect(section.getByText('Plan', { exact: true })).toBeHidden()
})

test('a plan below the chart is marked rather than silently cut short', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    profileOf(weightOnlyProfile),
    goalInProgress(),
    weightTimelineOf(BEHIND_PLAN),
  )

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: 'Your weight' })
  await expect(section.getByText('Plan off chart')).toBeVisible()
  // And the plan's own figure is still stated, the clamp being a rendering rule:
  // the last day is five kilos under a chart that stops two kilos down.
  await expect(
    page.getByText(timelineLine(BEHIND_PLAN.days.at(-1)!, false)),
  ).toBeAttached()

  // The mark itself, which only this layer can see: the chart is `aria-hidden`,
  // and unovis hands a Scatter's y accessor the accessor-group index where a Line
  // gets the row's — so a marker keyed on a day's position draws nothing at all
  // while every unit test, and the chip above, still pass.
  await expect
    .poll(() =>
      section.locator('svg path').evaluateAll((paths) => {
        const hex = getComputedStyle(document.documentElement)
          .getPropertyValue('--tucker-timeline-plan')
          .trim()
        const rgb = parseInt(hex.slice(1), 16)
        const filled = `rgb(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255})`
        return paths.filter((path) => getComputedStyle(path).fill === filled)
          .length
      }),
    )
    .toBe(1)
})

test('pointing at the chart reads out the day under the pointer', async ({
  page,
  goto,
  network,
}) => {
  network.use(weightTimelineOf(FOUR_WEEKS))

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
