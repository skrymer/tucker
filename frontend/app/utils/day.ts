/** A day named relative to the User's local today — tomorrow at the furthest (ADR 0035). */
export type RelativeDay = 'today' | 'tomorrow'

/** How each day is named and drawn: the sun for a day under way, sunrise for one that has not begun. */
export const RELATIVE_DAYS = {
  today: { label: 'Today', icon: 'i-lucide-sun' },
  tomorrow: { label: 'Tomorrow', icon: 'i-lucide-sunrise' },
} as const satisfies Record<RelativeDay, { label: string; icon: string }>

/** A day as Tucker names it, e.g. "Tomorrow · Thu 8 Oct". */
export function relativeDayHeading(day: RelativeDay, iso: string): string {
  return `${RELATIVE_DAYS[day].label} · ${formatDayHeadingFromISO(iso)}`
}
