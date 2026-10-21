import type { components } from '#open-fetch-schemas/api'

type RouteFigures = components['schemas']['RouteFiguresResponse']
type LayoutFigures = components['schemas']['LayoutFiguresResponse']

/**
 * The app's two layouts as the Admin chart draws them: what each is called, and
 * its colour, in the categorical palette's fixed order (DESIGN.md).
 */
export const LAYOUTS: readonly {
  layout: LayoutFigures['layout']
  name: string
  color: string
}[] = [
  { layout: 'phone', name: 'Phone', color: 'var(--tucker-cat-1)' },
  { layout: 'desktop', name: 'Desktop', color: 'var(--tucker-cat-2)' },
]

/** A bar's exact figures: percentiles only, never an average (ADR 0038). */
export function figuresLine(figures: LayoutFigures): string {
  const { n, p50, p75, p95 } = figures
  return `n ${n} · p50 ${p50} · p75 ${p75} · p95 ${p95} ms`
}

/**
 * A route as the Admin chart's axis names it: with each layout that has too few
 * samples for a figure, since that layout's bar is simply absent.
 */
export function routeLabel(route: RouteFigures): string {
  const tooFew = route.layouts
    .filter((l) => l.p75 == null)
    .map(
      (l) =>
        `${LAYOUTS.find(({ layout }) => layout === l.layout)?.name} too few: ${l.n}`,
    )
  return tooFew.length ? `${route.route} (${tooFew.join(', ')})` : route.route
}
