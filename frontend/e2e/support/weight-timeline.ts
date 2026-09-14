import { formatDmy } from './date'

/**
 * One day of a Weight Timeline as the section states it — the line both browser
 * layers read the figures back off. Mirrors the app's own
 * `weightTimelineReadout` (app/utils/weightTimeline.ts), kept as a copy because
 * e2e specs cannot resolve the app's `~/` import alias; keep the two in sync.
 */
export function timelineLine(day: {
  date: string
  weightKg: number | null
  trendKg: number
}): string {
  const reading =
    day.weightKg == null ? 'no weigh-in' : `${day.weightKg.toFixed(1)} kg`
  return `${formatDmy(day.date)} · ${reading} · trend ${day.trendKg.toFixed(1)} kg`
}
