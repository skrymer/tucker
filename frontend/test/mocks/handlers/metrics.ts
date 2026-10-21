import type { components } from '#open-fetch-schemas/api'
import { http } from '../http'

type RouteFigures = components['schemas']['RouteFiguresResponse']
type Sent = components['schemas']['MetricEventRequest']

/**
 * Why the backend refuses a batch whole, or null when it takes it: no events or
 * more than 50, a route that is not a template, or a time outside 0–60 000 ms or
 * absent (a NaN the page sent arrives as null; a decimal the backend takes, as
 * Jackson reads it into an Int), or no installed flag. A route change must also
 * carry its api wait, server time and first-visit flag, with 0 ≤ server ≤ api ≤
 * the move. Its CSRF proof is the backend's to check, as for every mutation
 * mocked here: a mocked page is handed no token.
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
      e.valueMs < 0 ||
      e.valueMs > 60_000 ||
      !isSplit(e),
  )
  return bad ? `a malformed metric: ${JSON.stringify(bad)}` : null
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

/** What Tucker measured of itself (ADR 0038): nothing yet. */
export const metricHandlers = [
  http.post('/api/metrics', async ({ request, response }) => {
    const message = refusal((await request.json()).events)
    return message ? response(400).json({ message }) : response(204).empty()
  }),
  http.get('/api/admin/metrics', ({ response }) =>
    response(200).json({ routes: [] }),
  ),
]

/**
 * Tucker measuring itself: what a send carries becomes what the Admin's report
 * counts. A few moves between pages is all a test makes, so every group stays
 * under the backend's five samples and carries its count and no figure; a test
 * past that reads a fixed `metricsReport` instead of re-deriving percentiles here.
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
    http.get('/api/admin/metrics', ({ response }) => {
      const routes = [...new Set(sent.map((e) => e.route))]
      return response(200).json({
        routes: routes.map((route) => ({
          route,
          layouts: (['phone', 'desktop'] as const).map((layout) => ({
            layout,
            n: sent.filter((e) => e.route === route && e.layout === layout)
              .length,
            p50: null,
            p75: null,
            p95: null,
            apiP75: null,
            coldP75: null,
            serverMs: null,
            networkMs: null,
            renderMs: null,
          })),
        })),
      })
    }),
  ]
}

/** The Admin's report, measured as [routes] say. */
export function metricsReport(routes: RouteFigures[]) {
  return http.get('/api/admin/metrics', ({ response }) =>
    response(200).json({ routes }),
  )
}
