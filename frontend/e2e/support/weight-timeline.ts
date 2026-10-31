import type { Locator } from '@playwright/test'
import { formatDmy } from './date'

/**
 * One day of a Weight Timeline as the section states it — the line both browser
 * layers read the figures back off. Mirrors the app's own
 * `weightTimelineReadout` (app/utils/weightTimeline.ts), kept as a copy because
 * that module resolves `#open-fetch-schemas/api` and Tucker's Nuxt auto-imports,
 * neither of which a Playwright spec runs inside; keep the two in sync.
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
    trajectoryKg?: number | null
  },
  tracksIntake: boolean,
): string {
  const reading =
    day.weightKg == null ? 'no weigh-in' : `${day.weightKg.toFixed(1)} kg`
  const body = `${formatDmy(day.date)} · ${reading} · trend ${day.trendKg.toFixed(1)} kg`
  const withIntake = tracksIntake ? body + intakeLine(day) : body
  return day.trajectoryKg == null
    ? withIntake
    : `${withIntake} · plan ${day.trajectoryKg.toFixed(1)} kg`
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

/**
 * How many of the chart's marks are filled in each bar colour. Only a browser
 * computes a fill — the chart is `aria-hidden` and happy-dom resolves no `var()` —
 * and each token is resolved on a probe inside the chart, so the light or dark
 * value is whichever the bars actually inherit.
 */
export function barFills(section: Locator) {
  return section
    .locator('svg')
    .first()
    .evaluate((svg) => {
      const fillOf = (colour: string) => {
        const probe = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'rect',
        )
        probe.style.fill = colour
        svg.appendChild(probe)
        const fill = getComputedStyle(probe).fill
        probe.remove()
        return fill
      }
      const fills = [...svg.querySelectorAll('path')].map(
        (path) => getComputedStyle(path).fill,
      )
      const count = (colour: string) =>
        fills.filter((fill) => fill === fillOf(colour)).length
      return {
        within: count('var(--tucker-timeline-intake)'),
        slightlyOver: count('var(--ui-warning)'),
        over: count('var(--ui-error)'),
      }
    })
}
