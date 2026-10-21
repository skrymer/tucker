import type { components } from '#open-fetch-schemas/api'

type RouteFigures = components['schemas']['RouteFiguresResponse']
type LayoutFigures = components['schemas']['LayoutFiguresResponse']

/** A bar's exact figures: percentiles only, never an average (ADR 0038). */
export function figuresLine(figures: LayoutFigures): string {
  const { n, p50, p75, p95 } = figures
  return `n ${n} · p50 ${p50} · p75 ${p75} · p95 ${p95} ms`
}

/** What the Admin page calls each layout the backend names. */
export const LAYOUT_NAMES: Record<string, string> = {
  phone: 'Phone',
  desktop: 'Desktop',
}

/**
 * A route as the Admin chart's axis names it: with each layout that has too few
 * samples for a figure, since that layout's bar is simply absent.
 */
export function routeLabel(route: RouteFigures): string {
  const tooFew = route.layouts
    .filter((l) => l.p75 == null)
    .map((l) => `${LAYOUT_NAMES[l.layout]} too few: ${l.n}`)
  return tooFew.length ? `${route.route} (${tooFew.join(', ')})` : route.route
}
