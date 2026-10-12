import { getDayOfWeek, parseDate } from '@internationalized/date'

/** Six weeks: the calendar always draws that many, spill-over days included. */
const GRID_DAYS = 42

/**
 * The days the calendar draws for [month] (`yyyy-mm`), both ends inclusive: from
 * the Monday on or before its first day, six weeks on.
 */
export function visibleGrid(month: string): { from: string; to: string } {
  const first = parseDate(`${month}-01`)
  // en-GB weeks start on Monday, so this counts the days back to it.
  const from = first.subtract({ days: getDayOfWeek(first, 'en-GB') })
  return {
    from: from.toString(),
    to: from.add({ days: GRID_DAYS - 1 }).toString(),
  }
}
