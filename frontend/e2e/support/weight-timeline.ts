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
    budgetVerdict?: string | null
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
  budgetVerdict?: string | null
}): string {
  if (day.caloriesKcal == null) return ' · not logged'
  const eaten = Math.round(day.caloriesKcal)
  if (day.calorieBudgetKcal == null) return ` · ${eaten} kcal`
  const figures = ` · ${eaten} / ${Math.round(day.calorieBudgetKcal)} kcal`
  if (day.budgetVerdict === 'slightly-over') return `${figures} · slightly over`
  if (day.budgetVerdict === 'over-budget') return `${figures} · over budget`
  return figures
}

/**
 * How many of the chart's marks are filled in each of [colours], by key. Only a
 * browser computes a fill — the chart is `aria-hidden` and happy-dom resolves no
 * `var()` — and each colour is resolved on a probe inside the chart, so the light
 * or dark value is whichever the marks actually inherit.
 */
export function fillCounts<K extends string>(
  section: Locator,
  colours: Record<K, string>,
): Promise<Record<K, number>> {
  return section
    .locator('svg')
    .first()
    .evaluate(
      (svg, wanted) => {
        const fills = [...svg.querySelectorAll('path')].map(
          (path) => getComputedStyle(path).fill,
        )
        const counts: Record<string, number> = {}
        for (const [key, colour] of Object.entries(wanted)) {
          const probe = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'rect',
          )
          probe.style.fill = colour
          svg.appendChild(probe)
          const resolved = getComputedStyle(probe).fill
          probe.remove()
          counts[key] = fills.filter((fill) => fill === resolved).length
        }
        return counts
      },
      colours as Record<string, string>,
    ) as Promise<Record<K, number>>
}

/**
 * How many bars are drawn in each verdict's colour. The tokens mirror
 * `INTAKE_COLOR`, `SLIGHTLY_OVER_COLOR` and `OVER_BUDGET_COLOR` in
 * app/utils/weightTimeline.ts, which a Playwright spec cannot import; keep them in sync.
 */
export function barFills(section: Locator) {
  return fillCounts(section, {
    within: 'var(--tucker-timeline-intake)',
    slightlyOver: 'var(--ui-warning)',
    over: 'var(--ui-error)',
  })
}
