import type { CurveType } from '@unovis/ts'
import type { components } from '#open-fetch-schemas/api'

/**
 * The two series' colours, shared by the chart and the key that names them, so a
 * swatch cannot come to mean a line it no longer matches. The trend leads in the
 * brand green; the readings are subordinate to it (frontend/DESIGN.md).
 */
export const TREND_COLOR = 'var(--ui-primary)'
export const READING_COLOR = 'var(--ui-text-dimmed)'

/**
 * The intake half's marks. Calories keep Tucker's green and turn error red once
 * over the Budget — the DayRing convention for this exact figure — while the
 * Budget itself is a neutral reference rule rather than a series of its own. A day
 * with no Entry is marked in the quietest of them, because the days a User did not
 * log must never be louder than the days they did.
 */
export const INTAKE_COLOR = 'var(--tucker-timeline-intake)'
export const OVER_BUDGET_COLOR = 'var(--ui-error)'
export const BUDGET_COLOR = 'var(--ui-text-muted)'
export const UNLOGGED_COLOR = 'var(--ui-text-dimmed)'

/**
 * A step, not a slope: a Calorie Budget changes on the day a Weekly Review sets
 * it and holds flat until the next one.
 *
 * Cast from the literal rather than imported as the enum value: `@unovis/ts`'s
 * barrel re-exports its maps and TopoJSON, which going direct to unovis exists to
 * keep off the chart chunk.
 */
export const BUDGET_CURVE = 'stepAfter' as CurveType

/** The windows a Weight Timeline is offered over (CONTEXT.md — Weight Timeline). */
export const TIMELINE_WINDOWS = [28, 90] as const

export type TimelineWindow = (typeof TIMELINE_WINDOWS)[number]

/** One day of a Weight Timeline, as the backend drew it. */
export type TimelineDay = components['schemas']['WeightTimelineDayResponse']

/** A Weight Timeline, as the backend drew it. */
export type Timeline = components['schemas']['WeightTimelineResponse']

/**
 * Whether the timeline has an intake half at all — which is what Calorie Tracking
 * decides, server-side (ADR 0029). A count of logged days is the one figure the
 * backend withholds wholesale rather than per day, so it is what says so.
 */
export function timelineTracksIntake(timeline: Timeline): boolean {
  return timeline.loggedDays != null
}

/**
 * One day of a Weight Timeline as a line of text — what the chart draws, said in
 * words. Read out under the pointer and listed for a screen reader, so the figures
 * an `aria-hidden` chart encodes are reachable either way.
 *
 * Both weights carry one decimal, the precision every other weight in Tucker is
 * stated at; a day nobody weighed in on says so rather than showing a figure.
 *
 * [tracksIntake] is the *timeline's* fact, not the day's: a tracking day before the
 * first Weekly Review carries neither figure and is still a day the User did not
 * log, which is what the chart's baseline tick marks.
 */
export function weightTimelineReadout(
  day: TimelineDay,
  tracksIntake: boolean,
): string {
  const reading =
    day.weightKg == null ? 'no weigh-in' : `${day.weightKg.toFixed(1)} kg`
  const body = `${formatDateFromISO(day.date)} · ${reading} · trend ${day.trendKg.toFixed(1)} kg`
  return tracksIntake ? body + intakeReadout(day) : body
}

/** What the day's eating adds to a readout — the tick, said in words. */
function intakeReadout(day: TimelineDay): string {
  if (day.caloriesKcal == null) return ' · not logged'
  if (day.calorieBudgetKcal == null)
    return ` · ${Math.round(day.caloriesKcal)} kcal`
  return ` · ${formatAgainstTarget(day.caloriesKcal, day.calorieBudgetKcal, 'kcal')}`
}

/**
 * Every day of a timeline as a line of text, formatted once per timeline rather
 * than once per pointer move — the list is read on every render, and a fresh
 * `Intl.DateTimeFormat` per day per frame is what a drag across 90 days costs.
 */
export function weightTimelineReadouts(
  timeline: Timeline,
): { date: string; text: string }[] {
  const tracksIntake = timelineTracksIntake(timeline)
  return timeline.days.map((day) => ({
    date: day.date,
    text: weightTimelineReadout(day, tracksIntake),
  }))
}

/**
 * Two scales on one plot, which is the cost ADR 0029 accepts for not stacking
 * panes: the weight series is given the top [WEIGHT_BAND] of the card and the
 * bars the bottom [INTAKE_BAND], the gap between them keeping the tallest day
 * clear of the lowest reading.
 *
 * unovis shares one y domain across every component of an `XYContainer` — a
 * per-component domain is overwritten on every render — so a calorie figure is
 * placed on the *kilogram* domain rather than given a scale of its own. Bars are
 * stacked from zero, which sits far below that domain, so each is clipped to the
 * plot floor and reads as growing from it.
 */
const WEIGHT_BAND = 0.55
const INTAKE_BAND = 0.4

/**
 * What the weight band spans when the weight did not move at all, there being no
 * range to divide the plot by. Only that case is padded: everywhere else the band
 * is the readings' own extent.
 */
const FLAT_WEIGHT_SPAN_KG = 0.4

/** Headroom above the tallest bar, so it never touches the weight band. */
const KCAL_HEADROOM = 1.05

/** How much of the bar band a day with no Entry is marked with. */
const UNLOGGED_TICK_SHARE = 0.04

/** The steps a kilogram axis is labelled at, coarsest last. */
const KG_TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5]

/** How many gaps between labels the weight band is allowed. */
const KG_TICK_GAPS = 4

/**
 * Round kilogram values within [low]..[high], and only within it: the domain
 * reaches far below the readings to make room for the bars, so letting the axis
 * pick its own ticks would mark weights down among them that nobody ever had.
 */
function kgTicksBetween(low: number, high: number): number[] {
  const step =
    KG_TICK_STEPS.find(
      (candidate) => (high - low) / candidate <= KG_TICK_GAPS,
    ) ?? KG_TICK_STEPS[KG_TICK_STEPS.length - 1]!
  const ticks: number[] = []
  for (
    let tick = Math.ceil(low / step) * step;
    tick <= high + step / 2 ** 10;
    tick += step
  ) {
    ticks.push(Number(tick.toFixed(1)))
  }
  // A band narrower than the finest step can contain no round value at all —
  // 80.02..80.06 contains none — and an axis handed no ticks draws no labels,
  // which is the one thing saying the top band is kilograms. Unrounded, so the
  // tick lands *inside* the band rather than among the bars beneath it or past
  // the ceiling; the axis renders it to a tenth either way.
  return ticks.length > 0 ? ticks : [(low + high) / 2]
}

/** How a Weight Timeline's two scales share one plot. */
export interface TimelineScale {
  /** The container's y domain, in kilograms — the weight band and the bars beneath it. */
  kgDomain: [number, number]
  /** Where the kilogram axis is labelled — within the weight band, and nowhere else. */
  kgTicks: number[]
  /** A calorie figure placed on that domain. */
  toKg(kcal: number): number
  /**
   * Where a day with no Entry is marked. Not zero — an absence drawn as nothing is
   * indistinguishable from an absence drawn as a floor-height bar, and the User has
   * to be able to see that their own log has holes in it.
   */
  unloggedKg: number
}

/**
 * The scale the intake half is drawn on, or null when there is no intake half —
 * which is what Calorie Tracking decides, server-side.
 */
export function weightTimelineScale(timeline: Timeline): TimelineScale | null {
  if (!timelineTracksIntake(timeline)) return null
  const weights = timeline.days.flatMap((day) =>
    day.weightKg == null ? [day.trendKg] : [day.trendKg, day.weightKg],
  )
  const lowest = Math.min(...weights)
  const highest = Math.max(...weights)
  const padding = highest > lowest ? 0 : FLAT_WEIGHT_SPAN_KG / 2
  // The band the weights are drawn over, and the domain that gives it the top
  // WEIGHT_BAND of the plot with the bars beneath.
  const [bandLow, bandHigh] = [lowest - padding, highest + padding]
  const floor = bandHigh - (bandHigh - bandLow) / WEIGHT_BAND
  const ceilingKcal =
    KCAL_HEADROOM *
    Math.max(
      1,
      ...timeline.days.flatMap((day) => [
        day.caloriesKcal ?? 0,
        day.calorieBudgetKcal ?? 0,
      ]),
    )
  const band = INTAKE_BAND * (bandHigh - floor)
  return {
    kgDomain: [floor, bandHigh],
    kgTicks: kgTicksBetween(bandLow, bandHigh),
    toKg: (kcal) => floor + (kcal / ceilingKcal) * band,
    unloggedKg: floor + UNLOGGED_TICK_SHARE * band,
  }
}

/**
 * How the chart reads a day: the accessors each series is drawn through, and the
 * two tick formats. Pure, so the rules live here rather than in the SFC, where
 * an `aria-hidden` chart leaves them assertable only through its own props.
 *
 * Both arguments are getters: the accessors are made once and still read the
 * timeline being drawn now, and [scale] is the caller's single one — the same
 * object the container's domain and ticks come from, so the bars and the axis
 * they are placed against cannot be derived apart.
 */
export function weightTimelineSeries(
  timeline: () => Timeline,
  scale: () => TimelineScale | null,
) {
  const days = () => timeline().days
  return {
    // The days arrive in order and are contiguous, so a day's position in the run
    // is its x — which keeps the scatter and the line on the same footing.
    at: (_day: TimelineDay, index: number) => index,
    trendKg: (day: TimelineDay) => day.trendKg,
    // Undefined rather than null or zero: unovis drops a point with a missing
    // value, which is what keeps a day nobody weighed in on off the chart rather
    // than on the floor.
    readingKg: (day: TimelineDay) => day.weightKg ?? undefined,
    // Only a whole position names a day. The scale picks its own tick values, so
    // it can ask for a fractional one (a 28-point run with a step of 2.5) or one
    // past the end while a narrower window is still loading — and an unlabelled
    // tick is better than `Invalid Date` printed on the axis.
    dayTick: (index: number) => {
      const day = Number.isInteger(index) ? days()[index] : undefined
      return day ? formatDayMonthFromISO(day.date) : ''
    },
    kgTick: (kg: number) => kg.toFixed(1),
    // The Budget the day was read against, on the bars' own scale. It spans a day
    // with no Entry — a Budget holds all week and did not lapse because the User
    // stopped recording — and is undefined only where none was in force.
    budgetKg: (day: TimelineDay) => {
      const current = scale()
      if (!current || day.calorieBudgetKcal == null) return undefined
      return current.toKg(day.calorieBudgetKcal)
    },
    // Which of the three the bar is: over the Budget, within it, or a mark where
    // no Entry was logged at all.
    intakeColor: (day: TimelineDay) => {
      if (day.caloriesKcal == null) return UNLOGGED_COLOR
      // The verdict the backend stated, never a comparison made here: a client that
      // re-derived it could colour a day the same day's DayStatus calls over
      // budget (ADR 0002).
      return day.overBudget ? OVER_BUDGET_COLOR : INTAKE_COLOR
    },
    // A day's bar, undefined throughout with Calorie Tracking off so that no bar
    // is drawn at all. Within a tracking window every day has a mark: a day with
    // no Entry gets the tick rather than nothing.
    intakeKg: (day: TimelineDay) => {
      const current = scale()
      if (!current) return undefined
      if (day.caloriesKcal == null) return current.unloggedKg
      // Never shorter than the tick: a logged day drawn under a day with no Entry
      // would invert the one distinction the tick exists to make. The two can meet,
      // and the colour is what tells them apart there.
      return Math.max(current.toKg(day.caloriesKcal), current.unloggedKg)
    },
  }
}
