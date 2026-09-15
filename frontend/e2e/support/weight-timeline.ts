import { formatDmy } from './date'

/**
 * One day of a Weight Timeline as the section states it — the line both browser
 * layers read the figures back off. Mirrors the app's own
 * `weightTimelineReadout` (app/utils/weightTimeline.ts), kept as a copy because
 * e2e specs cannot resolve the app's `~/` import alias; keep the two in sync.
 *
 * [tracksIntake] is the timeline's fact rather than the day's: a tracking day can
 * carry neither figure and still be a day the User did not log.
 */
export function timelineLine(
  day: {
    date: string
    weightKg: number | null
    trendKg: number
    caloriesKcal?: number | null
    calorieBudgetKcal?: number | null
  },
  tracksIntake: boolean,
): string {
  const reading =
    day.weightKg == null ? 'no weigh-in' : `${day.weightKg.toFixed(1)} kg`
  const body = `${formatDmy(day.date)} · ${reading} · trend ${day.trendKg.toFixed(1)} kg`
  return tracksIntake ? body + intakeLine(day) : body
}

function intakeLine(day: {
  caloriesKcal?: number | null
  calorieBudgetKcal?: number | null
}): string {
  if (day.caloriesKcal == null) return ' · not logged'
  const eaten = Math.round(day.caloriesKcal)
  if (day.calorieBudgetKcal == null) return ` · ${eaten} kcal`
  return ` · ${eaten} / ${Math.round(day.calorieBudgetKcal)} kcal`
}
