import type { components } from '#open-fetch-schemas/api'

type RouteFigures = components['schemas']['RouteFiguresResponse']
type LayoutFigures = components['schemas']['LayoutFiguresResponse']

/** The app's two layouts as the Admin chart names them, phone first. */
const LAYOUTS: readonly {
  layout: LayoutFigures['layout']
  name: string
}[] = [
  { layout: 'phone', name: 'Phone' },
  { layout: 'desktop', name: 'Desktop' },
]

/**
 * The three parts a move's time is split into (ADR 0038), in the order they stack
 * from the axis: what each is called, the figure that measures it, and its colour.
 */
export const PARTS: readonly {
  name: string
  figure: 'serverMs' | 'networkMs' | 'renderMs'
  color: string
}[] = [
  { name: 'Server', figure: 'serverMs', color: 'var(--tucker-cat-1)' },
  {
    name: 'Network + proxy',
    figure: 'networkMs',
    color: 'var(--tucker-cat-2)',
  },
  { name: 'Render / JS', figure: 'renderMs', color: 'var(--tucker-cat-3)' },
]

export type TimingRow = {
  route: string
  layout: (typeof LAYOUTS)[number]
  figures: LayoutFigures
}

/** One row per route and layout, top first: the routes in the backend's order, phone above desktop. */
export function timingRows(routes: RouteFigures[]): TimingRow[] {
  return routes.flatMap(({ route, layouts }) =>
    LAYOUTS.flatMap((layout) => {
      const figures = layouts.find((l) => l.layout === layout.layout)
      return figures ? [{ route, layout, figures }] : []
    }),
  )
}

/** A row as the chart's axis names it, saying why its bar is missing when it is. */
export function rowLabel({ route, layout, figures }: TimingRow): string {
  const label = `${route} · ${layout.name}`
  return figures.p75 == null ? `${label} · too few (n ${figures.n})` : label
}

/** A bar's exact figures: percentiles only, never an average (ADR 0038). */
export function figuresLine(figures: LayoutFigures): string {
  const { n, p50, p75, p95 } = figures
  return `n ${n} · p50 ${p50} · p75 ${p75} · p95 ${p95} ms`
}

/** A bar's api wait and its first visits ("cold"), each a p75. */
export function waitsLine({ apiP75, coldP75 }: LayoutFigures): string {
  return coldP75 == null
    ? `api p75 ${apiP75} ms · cold p75 too few`
    : `api p75 ${apiP75} · cold p75 ${coldP75} ms`
}
