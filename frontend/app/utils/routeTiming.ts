import type { components } from '#open-fetch-schemas/api'

type RouteFigures = components['schemas']['RouteFiguresResponse']
type LayoutFigures = components['schemas']['LayoutFiguresResponse']

/** The app's two layouts as the Admin chart names them. */
const LAYOUT_NAMES: Record<LayoutFigures['layout'], string> = {
  phone: 'Phone',
  desktop: 'Desktop',
}

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

export type TimingRow = { route: string; figures: LayoutFigures }

/**
 * One row per route and layout, top first, in the backend's order: the slowest
 * route first, each with every layout, phone above desktop.
 */
export function timingRows(routes: RouteFigures[]): TimingRow[] {
  return routes.flatMap(({ route, layouts }) =>
    layouts.map((figures) => ({ route, figures })),
  )
}

/** The route and layout a row stands for. */
export function rowName({ route, figures }: TimingRow): string {
  return `${route} · ${LAYOUT_NAMES[figures.layout]}`
}

/** A row as the chart's axis names it, saying why its bar is missing when it is. */
export function rowLabel(row: TimingRow): string {
  const { n, p75 } = row.figures
  return p75 == null ? `${rowName(row)} · too few (n ${n})` : rowName(row)
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
