import type { components } from '#open-fetch-schemas/api'
import { http } from '../http'

type RouteFigures = components['schemas']['RouteFiguresResponse']
type RouteReleases = components['schemas']['RouteReleasesResponse']
type LayoutFigures = components['schemas']['LayoutFiguresResponse']
type WebVitals = components['schemas']['WebVitalsResponse']
type VitalLayout = components['schemas']['VitalLayoutResponse']

/** A web vital in [layout] with [n] samples: figures from five, as the backend states them. */
export function vitalIn(
  layout: VitalLayout['layout'],
  n: number,
  figures: { p50: number; p75: number; p95: number } | null = null,
): VitalLayout {
  return { layout, n, ...(figures ?? { p50: null, p75: null, p95: null }) }
}

/** Page load and interaction measured nowhere: every layout listed, none counted. */
export function noWebVitals(): WebVitals {
  const none = () => [vitalIn('phone', 0), vitalIn('desktop', 0)]
  return { lcp: none(), inp: none() }
}

/** A layout with enough samples for every figure, its numbers any a test does not read. */
export function measured(
  layout: LayoutFigures['layout'],
  figures: Partial<Omit<LayoutFigures, 'layout'>> = {},
): LayoutFigures {
  return {
    layout,
    n: 20,
    p50: 300,
    p75: 450,
    p95: 700,
    apiP75: 250,
    coldP75: 900,
    serverMs: 80,
    networkMs: 160,
    renderMs: 200,
    ...figures,
  }
}

/** A layout with [n] samples, too few for the backend to state any figure. */
export function tooFew(
  layout: LayoutFigures['layout'],
  n: number,
): LayoutFigures {
  return {
    layout,
    n,
    p50: null,
    p75: null,
    p95: null,
    apiP75: null,
    coldP75: null,
    serverMs: null,
    networkMs: null,
    renderMs: null,
  }
}
type Sent = components['schemas']['MetricEventRequest']

/** semver.org's own pattern, the backend's `AppVersion` rule. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/**
 * Why the backend refuses a batch whole, or null when it takes it: no events or
 * more than 50, a route that is not a template, or a time outside 0–60 000 ms or
 * absent (a NaN the page sent arrives as null; a decimal the backend takes, as
 * Jackson reads it into an Int), no installed flag, or an app version that is
 * not a semantic version. A route change must also
 * carry its api wait, server time and first-visit flag, with 0 ≤ server ≤ api ≤
 * the move, and a page load or interaction must carry none of the three. Its CSRF
 * proof is the backend's to check, as for every mutation mocked here: a mocked
 * page is handed no token.
 */
function refusal(events: Sent[]): string | null {
  if (events.length < 1 || events.length > 50) {
    return `a batch must carry 1–50 metrics, not ${events.length}`
  }
  const bad = events.find(
    (e) =>
      !/^\/[a-z0-9/_\-[\]]{0,63}$/.test(e.route) ||
      typeof e.valueMs !== 'number' ||
      typeof e.installed !== 'boolean' ||
      !SEMVER.test(e.appVersion) ||
      e.valueMs < 0 ||
      e.valueMs > 60_000 ||
      !(e.kind === 'route-change' ? isSplit(e) : hasNoSplit(e)),
  )
  return bad ? `a malformed metric: ${JSON.stringify(bad)}` : null
}

/** Absent or null alike, as the backend's nullable request fields read them. */
function hasNoSplit({ apiMs, serverMs, firstVisit }: Sent): boolean {
  return apiMs == null && serverMs == null && firstVisit == null
}

function isSplit({ valueMs, apiMs, serverMs, firstVisit }: Sent): boolean {
  return (
    typeof apiMs === 'number' &&
    typeof serverMs === 'number' &&
    typeof firstVisit === 'boolean' &&
    serverMs >= 0 &&
    serverMs <= apiMs &&
    apiMs <= valueMs
  )
}

/** An Admin's filters as the backend reads them, absent where the page sends none. */
export type MetricQuery = {
  range: string
  engine: string | null
  version: string | null
  installed: boolean | null
}

type QueryParams = {
  get(name: 'range' | 'engine' | 'version' | 'installed'): string | null
}

/** The spellings Spring binds a Boolean from, trimmed and in any case; blank is absent. */
const FLAGS: Record<string, boolean> = {
  true: true,
  on: true,
  yes: true,
  '1': true,
  false: false,
  off: false,
  no: false,
  '0': false,
}

/**
 * An Admin's filters as the backend reads them, or why it refuses them: a range
 * or engine it does not offer, or an installed flag Spring cannot read as one.
 */
function readFilters(query: QueryParams): MetricQuery | string {
  // Spring binds an empty range or engine as absent, and the controller ignores
  // a version of spaces alone.
  const range = query.get('range') || '30d'
  const engine = query.get('engine') || null
  const installed = query.get('installed')
  if (!['24h', '7d', '30d', '90d'].includes(range)) {
    return `"${range}" is not a range`
  }
  if (
    engine != null &&
    !['webkit', 'blink', 'gecko', 'other'].includes(engine)
  ) {
    return `"${engine}" is not a browser engine`
  }
  const spelled = installed?.trim().toLowerCase()
  const flag = !spelled ? null : FLAGS[spelled]
  if (flag === undefined) {
    return `installed must be true or false, not "${installed}"`
  }
  return {
    range,
    engine,
    version: query.get('version')?.trim() ? query.get('version') : null,
    installed: flag,
  }
}

/** What Tucker measured of itself (ADR 0038): nothing yet. */
export const metricHandlers = [
  http.post('/api/metrics', async ({ request, response }) => {
    const message = refusal((await request.json()).events)
    return message ? response(400).json({ message }) : response(204).empty()
  }),
  metricsReport([]),
]

/** The moves [sent] holds that an Admin's version and installed filters let through. */
function matching(sent: Sent[], { version, installed }: MetricQuery): Sent[] {
  return sent.filter(
    (e) =>
      (version == null || e.appVersion === version) &&
      (installed == null || e.installed === installed),
  )
}

/** The moves between pages among [sent]: a page load or a tap is no route of the report's. */
function moves(sent: Sent[]): Sent[] {
  return sent.filter((e) => e.kind === 'route-change')
}

/** How many page loads and interactions [sent] holds in each layout, with no figure. */
function countedWebVitals(sent: Sent[]): WebVitals {
  const counted = (kind: Sent['kind']) =>
    (['phone', 'desktop'] as const).map((layout) =>
      vitalIn(
        layout,
        sent.filter((e) => e.kind === kind && e.layout === layout).length,
      ),
    )
  return { lcp: counted('lcp'), inp: counted('inp') }
}

/** Each route sent, with how many moves to it each layout made. */
function countedRoutes(sent: Sent[]): RouteFigures[] {
  return [...new Set(sent.map((e) => e.route))].map((route) => ({
    route,
    layouts: countedLayouts(sent.filter((e) => e.route === route)),
  }))
}

/** How many of [moves] each layout made, with no figure. */
function countedLayouts(moves: Sent[]): LayoutFigures[] {
  return (['phone', 'desktop'] as const).map((layout) =>
    tooFew(layout, moves.filter((e) => e.layout === layout).length),
  )
}

/**
 * Each route sent, with how many moves to it each layout made in each release —
 * in the order first sent, where the backend orders them by semver: a test sends
 * from one release, the app's own.
 */
function countedReleases(sent: Sent[]): RouteReleases[] {
  const versions = [...new Set(sent.map((e) => e.appVersion))]
  return [...new Set(sent.map((e) => e.route))].sort().map((route) => ({
    route,
    releases: versions.map((version) => ({
      version,
      layouts: countedLayouts(
        sent.filter((e) => e.route === route && e.appVersion === version),
      ).map(({ layout, n }) => ({ layout, n, p75: null })),
    })),
  }))
}

/**
 * Tucker measuring itself: what a send carries becomes what the Admin's report
 * counts. A few moves between pages is all a test makes, so every group stays
 * under the backend's five samples and carries its count and no figure; a test
 * past that reads a fixed `metricsReport` instead of re-deriving percentiles here.
 * Every move was sent just now, so each range holds them all. The engine is the
 * backend's to read from a user agent, so a test that filters by one is answered
 * a 501 saying to use `metricsBy`.
 */
export function metricsRecorded() {
  const sent: Sent[] = []
  return [
    http.post('/api/metrics', async ({ request, response }) => {
      const { events } = await request.json()
      const message = refusal(events)
      if (message) return response(400).json({ message })
      sent.push(...events)
      return response(204).empty()
    }),
    http.get('/api/admin/metrics', ({ query, response }) => {
      const filters = readFilters(query)
      if (typeof filters === 'string') {
        return response(400).json({ message: filters })
      }
      if (filters.engine != null) {
        return response.untyped(
          Response.json(
            { message: 'metricsRecorded reads no engine; use metricsBy' },
            { status: 501 },
          ),
        )
      }
      return response(200).json({
        routes: countedRoutes(moves(matching(sent, filters))),
        // Latest sent first, where the backend lists the newest release first:
        // a test sends from one release, the app's own.
        versions: [...new Set(sent.map((e) => e.appVersion).reverse())],
        byRelease: countedReleases(
          moves(matching(sent, { ...filters, version: null })),
        ),
        webVitals: countedWebVitals(matching(sent, filters)),
      })
    }),
  ]
}

/**
 * The Admin's report, measured as [answer] says for each set of filters, the
 * range holding [versions] — the same whichever filters are chosen, or as a
 * function says for each — each release's p75 as [byRelease] says, which no
 * version filter narrows, and page load and interaction as [webVitals] says.
 */
export function metricsBy(
  answer: (query: MetricQuery) => RouteFigures[],
  versions: string[] | ((query: MetricQuery) => string[]) = [],
  byRelease: RouteReleases[] = [],
  webVitals: (query: MetricQuery) => WebVitals = noWebVitals,
) {
  return http.get('/api/admin/metrics', ({ query, response }) => {
    const filters = readFilters(query)
    return typeof filters === 'string'
      ? response(400).json({ message: filters })
      : response(200).json({
          routes: answer(filters),
          versions:
            typeof versions === 'function' ? versions(filters) : versions,
          byRelease,
          webVitals: webVitals(filters),
        })
  })
}

/**
 * The Admin's report, measured as [routes], [byRelease] and [webVitals] say
 * whatever the filters.
 */
export function metricsReport(
  routes: RouteFigures[],
  versions: string[] = [],
  byRelease: RouteReleases[] = [],
  webVitals: WebVitals = noWebVitals(),
) {
  return metricsBy(
    () => routes,
    versions,
    byRelease,
    () => webVitals,
  )
}
