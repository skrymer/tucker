import { parseDate, startOfWeek } from '@internationalized/date'

/** Six weeks: the calendar always draws that many, spill-over days included. */
const GRID_DAYS = 42

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** A day of the week as the calendar counts it: 0 is Sunday. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** The days a calendar draws, ISO `yyyy-mm-dd`, both ends inclusive. */
export type CalendarGrid = { from: string; to: string }

/**
 * The days the calendar draws for [month] (`yyyy-mm`): from the [weekStartsOn]
 * day on or before its first day, six weeks on.
 */
export function visibleGrid(
  month: string,
  weekStartsOn: WeekStart,
): CalendarGrid {
  const from = startOfWeek(
    parseDate(`${month}-01`),
    'en-GB',
    WEEKDAYS[weekStartsOn],
  )
  return {
    from: from.toString(),
    to: from.add({ days: GRID_DAYS - 1 }).toString(),
  }
}
