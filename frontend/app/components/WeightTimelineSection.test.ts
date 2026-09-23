import { beforeEach, describe, expect, it, vi } from 'vitest'
import { camelize, defineComponent, h, nextTick } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { TimelineDay } from '~/utils/weightTimeline'
import {
  BUDGET_COLOR,
  INTAKE_COLOR,
  OVER_BUDGET_COLOR,
  READING_COLOR,
  TRAJECTORY_COLOR,
  TREND_COLOR,
} from '~/utils/weightTimeline'
import WeightTimelineSection from './WeightTimelineSection.vue'
import {
  timelineDays,
  weightTimeline,
  withIntake,
  withPlan,
} from '~~/test/weight-timeline-fixtures'

/** A tracking window: two days logged, the middle one not, all at one Budget. */
const trackedDays = withIntake(timelineDays([80.4, null, 80.2]), [
  2000,
  null,
  1000,
])
const tracked = weightTimeline({ days: trackedDays, loggedDays: 2 })

/** A weight-only window with an active Goal: the plan takes the intake half's place. */
const plannedDays = withPlan(
  timelineDays([80.4, null, 80.2]),
  [80.0, 79.9, 79.8],
)
const planned = weightTimeline({ days: plannedDays })

/**
 * The chart, mocked for the whole file. It is a third-party component with no
 * accessible surface, so ADR 0013's "mock only the true external boundary" puts
 * it here — and unovis' `MutationObserver` teardown throws under happy-dom, so
 * the real one cannot mount at all. The browser layers render it for real.
 */
const drawn: Record<string, Record<string, unknown>[]> = {}
function chartPart(name: string) {
  return defineComponent({
    inheritAttrs: false,
    setup: (_props, { attrs, slots }) => {
      // One slot per instance, in template order: the chart draws two lines, and
      // which is the trend and which the Budget is exactly what the tests assert.
      const rendered = (drawn[name] ??= [])
      const index = rendered.length
      rendered.push({})
      return () => {
        // Keys camelized: a component declaring no props (VisCrosshair) receives
        // every binding through attrs in the casing the template wrote it, so
        // this reads the same either way.
        rendered[index] = Object.fromEntries(
          Object.entries(attrs).map(([key, value]) => [camelize(key), value]),
        )
        return h('div', slots.default?.())
      }
    },
  })
}

/**
 * The chart draws three lines, in this order: the Budget step across the bars, the
 * Goal's planned trajectory, and the Trend Weight over both — the reference marks
 * beneath the User's own body.
 */
const BUDGET_LINE = 0
const PLAN_LINE = 1
const TREND_LINE = 2

/** The chart draws the day axis first, then the kilogram one. */
const DAY_AXIS = 0
const KG_AXIS = 1

/** The chart scatters the readings first, then the edges the plan leaves by. */
const CLIP_MARKERS = 1

/** What the [index]th [name] the chart drew was handed. */
function part(name: string, index = 0): Record<string, unknown> {
  const props = drawn[name]?.[index]
  expect(props, `the chart drew no ${name} #${index}`).toBeDefined()
  return props!
}
vi.mock('@unovis/vue', () => ({
  VisXYContainer: chartPart('VisXYContainer'),
  VisLine: chartPart('VisLine'),
  VisScatter: chartPart('VisScatter'),
  VisStackedBar: chartPart('VisStackedBar'),
  VisAxis: chartPart('VisAxis'),
  VisCrosshair: chartPart('VisCrosshair'),
}))

describe('WeightTimelineSection', () => {
  beforeEach(() => {
    for (const rendered of Object.values(drawn)) rendered.length = 0
  })

  it('states every day it draws in words, since the chart itself is decorative', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: {
        timeline: weightTimeline({ days: timelineDays([80.4, null, 80.2]) }),
      },
    })

    expect(
      screen.getByText('1 Jun 2026 · 80.4 kg · trend 80.1 kg'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('2 Jun 2026 · no weigh-in · trend 80.1 kg'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('3 Jun 2026 · 80.2 kg · trend 80.2 kg'),
    ).toBeInTheDocument()
  })

  it('hands the chosen window to the page, which is what asks for it', async () => {
    const user = userEvent.setup()
    const chosen = vi.fn()
    await renderSuspended(WeightTimelineSection, {
      props: {
        timeline: weightTimeline(),
        windowDays: 28,
        'onUpdate:windowDays': chosen,
      },
    })

    await user.click(screen.getByRole('tab', { name: '90 days' }))

    expect(chosen).toHaveBeenCalledWith(90)
  })

  it('offers 28 days and 90, marking the window being shown', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline(), windowDays: 90 },
    })

    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
      '90 days',
    )
    expect(
      within(screen.getByRole('group', { name: 'Window' })).getAllByRole('tab'),
    ).toHaveLength(2)
  })

  // An aria-hidden chart has no accessible surface, so what it was handed is
  // invisible to every other assertion. Pinned through its own props, the only
  // seam it has (see known-survivors.md).
  it('draws the trend as the line and the readings as points beneath it', async () => {
    const days = timelineDays([80.4, null, 80.2])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })

    expect(part('VisXYContainer').data).toEqual(days)
    const trendY = part('VisLine', TREND_LINE).y as (day: TimelineDay) => number
    expect(days.map((day) => trendY(day))).toEqual([80.1, 80.1, 80.2])
    // A day nobody weighed in on contributes no point: unovis drops a missing
    // value rather than drawing it at the floor.
    const readingY = part('VisScatter').y as (
      day: TimelineDay,
    ) => number | undefined
    expect(days.map((day) => readingY(day))).toEqual([80.4, undefined, 80.2])
    // And the axis beneath them is reading the same days: the accessors are made
    // once from getters, so a getter wired to the wrong thing shows up here alone.
    const dayAt = part('VisAxis', DAY_AXIS).tickFormat as (i: number) => string
    expect(dayAt(1)).toBe('2 Jun')
  })

  it('draws each day as a bar, on a scale of its own beneath the weights', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: tracked },
    })

    const bars = part('VisStackedBar')
    const height = bars.y as (day: TimelineDay) => number | undefined
    expect(height(trackedDays[0]!)!).toBeGreaterThan(height(trackedDays[2]!)!)
    const colour = bars.color as (day: TimelineDay) => string
    expect(colour(trackedDays[0]!)).toBe(OVER_BUDGET_COLOR)
    expect(colour(trackedDays[2]!)).toBe(INTAKE_COLOR)
    // Off the shared domain calculation: a bar is stacked from zero, so including
    // it would stretch the kilogram axis to the origin and flatten the trend.
    expect(bars.excludeFromDomainCalculation).toBe(true)
  })

  it('draws the Budget as a step across the window, spanning a day with no Entry', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: tracked },
    })

    const budget = part('VisLine', BUDGET_LINE)
    const height = budget.y as (day: TimelineDay) => number | undefined
    // The same figure on the unlogged day as on the ones either side: a Budget
    // holds all week and did not lapse because the User stopped recording.
    expect(height(trackedDays[1]!)).toBe(height(trackedDays[0]!))
    expect(budget.color).toBe(BUDGET_COLOR)
    // A step, not a slope: a Budget changes on the day a Weekly Review sets it.
    expect(budget.curveType).toBe('stepAfter')
    expect(budget.excludeFromDomainCalculation).toBe(true)
  })

  it('makes room beneath the weights for the bars, and labels only where the weights are', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: tracked },
    })

    const [floor, ceiling] = part('VisXYContainer').yDomain as [number, number]
    expect(ceiling).toBe(80.4)
    expect(floor).toBeLessThan(80.1)
    // The domain reaches far below the readings, and a kilogram gridline down
    // among the bars would mark a weight this User never had.
    const ticks = part('VisAxis', KG_AXIS).tickValues as number[]
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(80.1)
    expect(Math.max(...ticks)).toBeLessThanOrEqual(80.4)
  })

  it('reads out the day under the pointer', async () => {
    const days = timelineDays([80.4, null, 80.2])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })
    const pointAt = part('VisCrosshair').onCrosshairMove as (
      x: number | undefined,
      day: TimelineDay,
    ) => void

    pointAt(1, days[1]!)
    await nextTick()

    expect(screen.getByRole('status')).toHaveTextContent(
      '2 Jun 2026 · no weigh-in · trend 80.1 kg',
    )
  })

  it('holds the day it last read out, a tap having no hover to leave', async () => {
    const days = timelineDays([80.4, null, 80.2])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })
    const pointAt = part('VisCrosshair').onCrosshairMove as (
      x?: number,
      day?: TimelineDay,
    ) => void

    pointAt(2, days[2]!)
    await nextTick()
    // What unovis reports when the pointer leaves the container.
    pointAt(undefined, undefined)
    await nextTick()

    expect(screen.getByRole('status')).toHaveTextContent(
      '3 Jun 2026 · 80.2 kg · trend 80.2 kg',
    )
  })

  it('drops a readout the new window no longer draws', async () => {
    const days = timelineDays([80.4, null, 80.2])
    const { rerender } = await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })
    const pointAt = part('VisCrosshair').onCrosshairMove as (
      x: number,
      day: TimelineDay,
    ) => void
    pointAt(0, days[0]!)
    await nextTick()

    // A narrower window, opening after the day being read out.
    await rerender({ timeline: weightTimeline({ days: days.slice(1) }) })

    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('names both strokes, so neither is identified by its colour alone', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline() },
    })

    expect(screen.getByText('Trend')).toBeVisible()
    expect(screen.getByText('Weigh-ins')).toBeVisible()
    // The key draws in the colours the chart was handed, so a swatch cannot come
    // to name a stroke it no longer matches.
    expect(part('VisLine', TREND_LINE).color).toBe(TREND_COLOR)
    expect(part('VisScatter').color).toBe(READING_COLOR)
  })

  it('names the calorie marks too, colour carrying no identity here either', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: tracked },
    })

    expect(screen.getByText('Calories')).toBeVisible()
    expect(screen.getByText('Budget')).toBeVisible()
  })

  it('says how much of the window it drew was actually logged', async () => {
    // The width of a window is no evidence it was lived in, the discount the
    // Intake Breakdown caption and the micronutrient card already make.
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: tracked },
    })

    expect(screen.getByText('2 of 3 days logged')).toBeVisible()
  })

  it('is the weight half alone with Calorie Tracking off, not a hidden intake half', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days: trackedDays }) },
    })

    // Probed with days that *do* carry figures, so what suppresses the bars is
    // the timeline having no intake half rather than the days having no calories.
    const height = part('VisStackedBar').y as (
      day: TimelineDay,
    ) => number | undefined
    expect(trackedDays.map(height)).toEqual([undefined, undefined, undefined])
    // And the weight keeps the whole card, on the axis slice 1 gave it.
    expect(part('VisXYContainer').yDomain).toBeUndefined()
    expect(part('VisAxis', KG_AXIS).tickValues).toBeUndefined()
    expect(screen.queryByText('Calories')).not.toBeInTheDocument()
    expect(screen.queryByText('Budget')).not.toBeInTheDocument()
    expect(screen.queryByText(/days logged/)).not.toBeInTheDocument()
  })

  it("draws the Goal's plan as a line of its own, told apart from the trend", async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: planned },
    })

    const plan = part('VisLine', PLAN_LINE)
    // Called with the day alone: unovis hands a Scatter's y accessor the
    // accessor-group index where a Line gets the row's, so an accessor that reads
    // a position draws nothing at all on the marker beside this line.
    const height = plan.y as (day: TimelineDay) => number
    expect(plannedDays.map((day) => height(day))).toEqual([80.0, 79.9, 79.8])
    expect(plan.color).toBe(TRAJECTORY_COLOR)
    expect(plan.color).not.toBe(part('VisLine', TREND_LINE).color)
    // Straight, never smoothed: the plan has a corner where it flattens at the
    // target, and a monotone curve would round it into a deceleration into the
    // Goal that the plan does not promise (ADR 0029 — it describes, never infers).
    expect(plan.curveType).toBe('linear')
    // Named in words, colour never carrying an identity on its own.
    expect(screen.getByText('Plan')).toBeVisible()
  })

  it('marks where a plan too far below the weights leaves the chart', async () => {
    // The plan ends five kilos under a User who has barely moved, so the axis
    // stops two kilos down and the line runs off the bottom of the card.
    const days = withPlan(timelineDays([80.4, null, 80.2]), [79.0, 77.0, 75.0])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })

    const marker = part('VisScatter', CLIP_MARKERS)
    const edge = marker.y as (day: TimelineDay) => number | undefined
    expect(days.map((day) => edge(day))).toEqual([
      undefined,
      expect.closeTo(78.1, 10),
      undefined,
    ])
    expect(marker.color).toBe(TRAJECTORY_COLOR)
    // Said in words too, a mark on an aria-hidden chart being nothing on its own —
    // and on the plan's own chip, so one entry always names everything it draws.
    expect(screen.getByText('Plan off chart')).toBeVisible()
    expect(screen.queryByText('Plan')).not.toBeInTheDocument()
  })

  it('draws no plan beside the bars, the two never sharing a card', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: tracked },
    })

    const height = part('VisLine', PLAN_LINE).y as (
      day: TimelineDay,
    ) => number | undefined
    expect(trackedDays.map((day) => height(day))).toEqual([
      undefined,
      undefined,
      undefined,
    ])
    // Nor an edge for it to have left by, there being no plot edge it could reach.
    const edge = part('VisScatter', CLIP_MARKERS).y as (
      day: TimelineDay,
    ) => number | undefined
    expect(trackedDays.map((day) => edge(day))).toEqual([
      undefined,
      undefined,
      undefined,
    ])
    expect(screen.queryByText('Plan')).not.toBeInTheDocument()
  })

  it('draws the plan on a domain of its own, and marks the edge with a diamond', async () => {
    const days = withPlan(timelineDays([80.4, null, 80.2]), [79.0, 77.0, 75.0])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })

    // The weights alone span 80.1..80.4; the plot is stretched two kilos down to
    // hold what it can of the plan, and no further.
    expect(part('VisXYContainer').yDomain as [number, number]).toEqual([
      expect.closeTo(78.1, 10),
      80.4,
    ])
    // A diamond, the one shape unovis offers that is correct at either edge — its
    // triangle only points up, and the plan can leave by the top. Neither this nor
    // the size was pinned by anything: the e2e counts marks in the plan's colour,
    // which a circle satisfies too.
    const marker = part('VisScatter', CLIP_MARKERS)
    expect(marker.shape).toBe('diamond')
    expect(marker.size).toBe(CLIP_MARKER_PX)
  })

  it('names no edge while the whole plan is drawn', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: planned },
    })

    const edge = part('VisScatter', CLIP_MARKERS).y as (
      day: TimelineDay,
    ) => number | undefined
    expect(plannedDays.map((day) => edge(day))).toEqual([
      undefined,
      undefined,
      undefined,
    ])
    expect(screen.getByText('Plan')).toBeVisible()
    expect(screen.queryByText('Plan off chart')).not.toBeInTheDocument()
  })

  it('says a plan is coming rather than rendering as Maintenance Mode', async () => {
    // The two-device case: a Goal set on a phone already into tomorrow, read on a
    // desktop whose window closes today. No day carries a plan, so nothing is
    // drawn — and in Maintenance Mode nothing is drawn either (ADR 0029).
    await renderSuspended(WeightTimelineSection, {
      props: {
        timeline: weightTimeline({
          days: timelineDays([80.4, 80.2, 80.1]),
          planStartsOn: '2026-06-04',
        }),
      },
    })

    expect(screen.getByText('Your goal’s plan starts 4 Jun.')).toBeVisible()
    // Not the key chip, which names a stroke the chart is drawing.
    expect(screen.queryByText('Plan')).not.toBeInTheDocument()
  })

  it('stays silent in Maintenance Mode, where there is no plan to be waiting for', async () => {
    // The same drawn nothing as the test above, and the opposite sentence: here
    // Tucker defends no target weight, so a plain weight card is the decision
    // rather than a plan that has not arrived (ADR 0008, ADR 0029).
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline() },
    })

    expect(screen.queryByText(/plan starts/)).not.toBeInTheDocument()
    expect(screen.queryByText('Plan')).not.toBeInTheDocument()
  })

  it('reads the plan out beside the day, the chart being unable to say it', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: planned },
    })
    const pointAt = part('VisCrosshair').onCrosshairMove as (
      x: number,
      day: TimelineDay,
    ) => void

    pointAt(0, plannedDays[0]!)
    await nextTick()

    // The whole line, not a prefix of it: `toHaveTextContent` matches a substring,
    // so asserting the day without the plan would pass while saying the opposite
    // of what the readout does — and this is the plan's only accessible surface,
    // the chart above it being `aria-hidden` (ADR 0029).
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 Jun 2026 · 80.4 kg · trend 80.1 kg · plan 80.0 kg',
    )
  })

  it('says a wider window is on its way rather than passing the old one off as it', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline(), pending: true },
    })

    expect(screen.getByRole('region', { name: 'Your weight' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('names no day while the crosshair is hidden, whatever is nearest the pointer', async () => {
    // Along the x-axis strip the pointer is outside the plotted range: unovis still
    // reports the nearest day, and passes no position to say it is marking nothing.
    const days = timelineDays([80.4, null, 80.2])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })
    const pointAt = part('VisCrosshair').onCrosshairMove as (
      x: number | undefined,
      day: TimelineDay,
    ) => void

    pointAt(undefined, days[2]!)
    await nextTick()

    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
