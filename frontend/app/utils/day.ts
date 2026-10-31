/** A day named relative to the User's local today — tomorrow at the furthest (ADR 0035). */
export type RelativeDay = 'today' | 'tomorrow'

const RELATIVE_DAYS = {
  today: 'Today',
  tomorrow: 'Tomorrow',
} as const satisfies Record<RelativeDay, string>

/** A day as Tucker names it, e.g. "Tomorrow · Thu 8 Oct". */
export function relativeDayHeading(day: RelativeDay, iso: string): string {
  return `${RELATIVE_DAYS[day]} · ${formatDayHeadingFromISO(iso)}`
}

/** Any day as Tucker heads it: named when it is [today] or the day after, plain otherwise. */
export function dayHeading(iso: string, today: string): string {
  if (iso === today) return relativeDayHeading('today', iso)
  if (iso === localTomorrow(today)) return relativeDayHeading('tomorrow', iso)
  return formatDayHeadingFromISO(iso)
}
