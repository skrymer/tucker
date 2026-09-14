import type { components } from '#open-fetch-schemas/api'

/**
 * The two series' colours, shared by the chart and the key that names them, so a
 * swatch cannot come to mean a line it no longer matches. The trend leads in the
 * brand green; the readings are subordinate to it (frontend/DESIGN.md).
 */
export const TREND_COLOR = 'var(--ui-primary)'
export const READING_COLOR = 'var(--ui-text-dimmed)'

/** The windows a Weight Timeline is offered over (CONTEXT.md — Weight Timeline). */
export const TIMELINE_WINDOWS = [28, 90] as const

export type TimelineWindow = (typeof TIMELINE_WINDOWS)[number]

/** One day of a Weight Timeline, as the backend drew it. */
export type TimelineDay = components['schemas']['WeightTimelineDayResponse']

/**
 * One day of a Weight Timeline as a line of text — what the chart draws, said in
 * words. Read out under the pointer and listed for a screen reader, so the figures
 * an `aria-hidden` chart encodes are reachable either way.
 *
 * Both weights carry one decimal, the precision every other weight in Tucker is
 * stated at; a day nobody weighed in on says so rather than showing a figure.
 */
export function weightTimelineReadout(day: TimelineDay): string {
  const reading =
    day.weightKg == null ? 'no weigh-in' : `${day.weightKg.toFixed(1)} kg`
  return `${formatDateFromISO(day.date)} · ${reading} · trend ${day.trendKg.toFixed(1)} kg`
}

/**
 * Every day of a timeline as a line of text, formatted once per timeline rather
 * than once per pointer move — the list is read on every render, and a fresh
 * `Intl.DateTimeFormat` per day per frame is what a drag across 90 days costs.
 */
export function weightTimelineReadouts(
  days: TimelineDay[],
): { date: string; text: string }[] {
  return days.map((day) => ({
    date: day.date,
    text: weightTimelineReadout(day),
  }))
}

/**
 * How the chart reads a day: the accessors each series is drawn through, and the
 * two tick formats. Pure, so the rules live here rather than in the SFC, where
 * an `aria-hidden` chart leaves them assertable only through its own props.
 *
 * [days] is a getter so the accessors are made once and still read the timeline
 * being drawn now.
 */
export function weightTimelineSeries(days: () => TimelineDay[]) {
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
  }
}
