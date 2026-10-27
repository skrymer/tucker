import { HttpResponse } from 'msw'
import { http } from '../http'

/** One outcome of one endpoint, as Micrometer keeps it: one series per `method + uri + outcome`. */
export type ServedRequests = {
  method: string
  uri: string
  outcome?: 'SUCCESS' | 'CLIENT_ERROR' | 'SERVER_ERROR'
  count: number
  p50Ms?: number
  p95Ms?: number
}

/** What the server's registry holds, before Actuator renders it as text. */
export type ServedServer = {
  uptimeSeconds: number
  processCpu: number
  systemCpu: number
  heapUsedBytes: number
  heapMaxBytes: number
  gcPauseTotalSeconds: number
  gcPauseCount: number
  requests: ServedRequests[]
}

const MB = 1024 * 1024
const GB = 1024 * MB

/** A server three days up, some endpoints timed and two too few to time. */
export const runningServer: ServedServer = {
  uptimeSeconds: 3 * 86400 + 7 * 3600 + 42 * 60,
  processCpu: 0.034,
  systemCpu: 0.21,
  heapUsedBytes: 182 * MB,
  heapMaxBytes: 256 * MB,
  gcPauseTotalSeconds: 4.82,
  gcPauseCount: 1317,
  requests: [
    {
      method: 'GET',
      uri: '/api/admin/metrics',
      count: 41,
      p50Ms: 88,
      p95Ms: 412,
    },
    {
      method: 'GET',
      uri: '/api/foods/barcode/{barcode}',
      count: 21,
      p50Ms: 214,
      p95Ms: 380,
    },
    {
      method: 'GET',
      uri: '/api/foods/barcode/{barcode}',
      outcome: 'SERVER_ERROR',
      count: 2,
      p50Ms: 8000,
      p95Ms: 8000,
    },
    { method: 'GET', uri: '/api/summary', count: 812, p50Ms: 19, p95Ms: 74 },
    { method: 'GET', uri: '/api/me', count: 977, p50Ms: 4, p95Ms: 11 },
    {
      method: 'DELETE',
      uri: '/api/entries/{id}',
      count: 3,
      p50Ms: 12,
      p95Ms: 30,
    },
    {
      method: 'POST',
      uri: '/api/weekly-review',
      outcome: 'SERVER_ERROR',
      count: 1,
      p50Ms: 40,
      p95Ms: 40,
    },
  ],
}

/** [server] as Actuator's `prometheus` endpoint renders it: Prometheus' text format. */
export function prometheusScrape(server: ServedServer): string {
  const requests = server.requests.flatMap((r) => {
    const labels = `method="${r.method}",outcome="${r.outcome ?? 'SUCCESS'}",uri="${r.uri}"`
    const p50 = (r.p50Ms ?? 0) / 1000
    const p95 = (r.p95Ms ?? 0) / 1000
    return [
      `http_server_requests_seconds{${labels},quantile="0.5"} ${p50}`,
      `http_server_requests_seconds{${labels},quantile="0.95"} ${p95}`,
      `http_server_requests_seconds_count{${labels}} ${r.count}`,
      `http_server_requests_seconds_sum{${labels}} ${r.count * p50}`,
    ]
  })
  return [
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${server.uptimeSeconds}`,
    `process_cpu_usage ${server.processCpu}`,
    `system_cpu_usage ${server.systemCpu}`,
    // G1's young pools report no limit; the old generation holds the heap's.
    `jvm_memory_max_bytes{area="heap",id="G1 Eden Space"} -1.0`,
    `jvm_memory_max_bytes{area="heap",id="G1 Old Gen"} ${server.heapMaxBytes}`,
    `jvm_memory_max_bytes{area="nonheap",id="Metaspace"} -1.0`,
    `jvm_memory_used_bytes{area="heap",id="G1 Eden Space"} ${server.heapUsedBytes / 2}`,
    `jvm_memory_used_bytes{area="heap",id="G1 Old Gen"} ${server.heapUsedBytes / 2}`,
    `jvm_memory_used_bytes{area="nonheap",id="Metaspace"} ${96 * MB}`,
    `jvm_gc_pause_seconds_count{action="end of minor GC",cause="G1 Evacuation Pause",gc="G1 Young Generation"} ${server.gcPauseCount}`,
    `jvm_gc_pause_seconds_sum{action="end of minor GC",cause="G1 Evacuation Pause",gc="G1 Young Generation"} ${server.gcPauseTotalSeconds}`,
    '# TYPE http_server_requests_seconds summary',
    ...requests,
    '',
  ].join('\n')
}

/** What `health` answers, with the data volume's disk beneath it. */
export function healthBody({
  status = 'UP',
  totalBytes = 39.1 * GB,
  freeBytes = 31.4 * GB,
} = {}) {
  return {
    status,
    components: {
      db: { status: 'UP' },
      diskSpace: {
        status: freeBytes < GB ? 'DOWN' : 'UP',
        details: {
          total: totalBytes,
          free: freeBytes,
          threshold: GB,
          path: '/data',
          exists: true,
        },
      },
      ping: { status: 'UP' },
    },
  }
}

/**
 * The `prometheus` scrape of [server]. Untyped, because the spec describes
 * Actuator's text as an object.
 */
export const serving = (server: ServedServer) =>
  http.get('/api/actuator/prometheus', ({ response }) =>
    response.untyped(
      HttpResponse.text(prometheusScrape(server), {
        headers: { 'Content-Type': 'text/plain;version=0.0.4;charset=utf-8' },
      }),
    ),
  )

/**
 * The `health` read, answered as Actuator does: 200 when UP, 503 when DOWN, the
 * body the health either way. Untyped, because the spec describes Actuator's health
 * as an object without properties, and its 503 as Tucker's error body.
 */
export const health = (
  options: {
    status?: 'UP' | 'DOWN'
    totalBytes?: number
    freeBytes?: number
  } = {},
) =>
  http.get('/api/actuator/health', ({ response }) =>
    response.untyped(
      HttpResponse.json(healthBody(options), {
        status: options.status === 'DOWN' ? 503 : 200,
      }),
    ),
  )

/** The server's own figures, read by the Admin page (ADR 0039). */
export const serverHandlers = [serving(runningServer), health()]
