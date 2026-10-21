import type { components } from '#open-fetch-schemas/api'
import { http } from '../http'

type RouteFigures = components['schemas']['RouteFiguresResponse']

/**
 * What Tucker measured of itself (ADR 0038). A send is refused whole when it
 * carries no events or more than 50, as the backend refuses it. Its CSRF proof is
 * the backend's to check, as for every mutation mocked here: a mocked page is
 * handed no token. Nothing has been measured yet.
 */
export const metricHandlers = [
  http.post('/api/metrics', async ({ request, response }) => {
    const { events } = await request.json()
    if (events.length < 1 || events.length > 50) {
      return response(400).json({
        message: `a batch must carry 1–50 metrics, not ${events.length}`,
      })
    }
    return response(204).empty()
  }),
  http.get('/api/admin/metrics', ({ response }) =>
    response(200).json({ routes: [] }),
  ),
]

type Sent = components['schemas']['MetricEventRequest']

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
      sent.push(...(await request.json()).events)
      return response(204).empty()
    }),
    http.get('/api/admin/metrics', ({ response }) => {
      const routes = [...new Set(sent.map((e) => e.route))]
      return response(200).json({
        routes: routes.map((route) => ({
          route,
          layouts: ['phone', 'desktop'].map((layout) => ({
            layout,
            n: sent.filter((e) => e.route === route && e.layout === layout)
              .length,
            p50: null,
            p75: null,
            p95: null,
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
