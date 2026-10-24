import type { components } from '#open-fetch-schemas/api'

type RouteReleases = components['schemas']['RouteReleasesResponse']
type Release = RouteReleases['releases'][number]

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
  release: Release
  phone: number | undefined
  desktop: number | undefined
}

const layoutIn = (release: Release, layout: ReleaseSeries['layout']) =>
  release.layouts.find((l) => l.layout === layout)

export function figureIn(
  release: Release,
  layout: ReleaseSeries['layout'],
): string {
  return p75Label(layoutIn(release, layout) ?? { n: 0 })
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
  return releases.map((release) => ({
    release,
    phone: layoutIn(release, 'phone')?.p75 ?? undefined,
    desktop: layoutIn(release, 'desktop')?.p75 ?? undefined,
  }))
}
