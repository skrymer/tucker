import type { components } from '#open-fetch-schemas/api'

type RouteReleases = components['schemas']['RouteReleasesResponse']
type ReleaseLayout = components['schemas']['ReleaseLayoutResponse']

/** How one layout's line is drawn and named. */
export type ReleaseSeries = {
  layout: 'phone' | 'desktop'
  label: string
  color: string
  dash: number[] | undefined
  shape: string
}

/** One release on a route's small chart: each layout's p75, absent where it has none. */
export type ReleasePoint = {
  version: string
  phone: number | undefined
  desktop: number | undefined
}

export function figureIn(
  release: RouteReleases['releases'][number],
  layout: ReleaseSeries['layout'],
): string {
  const figures = release.layouts.find((l) => l.layout === layout)
  return layoutFigure(figures ?? { layout, n: 0, p75: null })
}

export function layoutFigure({ n, p75 }: ReleaseLayout): string {
  return p75 == null ? `too few (n ${n})` : `${p75} ms`
}

/** The top of the one y-scale every route's chart shares. */
export function sharedScaleMax(routes: RouteReleases[]): number {
  return Math.max(
    0,
    ...routes.flatMap((r) =>
      r.releases.flatMap((rel) => rel.layouts.map((l) => l.p75 ?? 0)),
    ),
  )
}

export function releasePoints({ releases }: RouteReleases): ReleasePoint[] {
  return releases.map(({ version, layouts }) => {
    const p75 = (layout: 'phone' | 'desktop') =>
      layouts.find((l) => l.layout === layout)?.p75 ?? undefined
    return { version, phone: p75('phone'), desktop: p75('desktop') }
  })
}
