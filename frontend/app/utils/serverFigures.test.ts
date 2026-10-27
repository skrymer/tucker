import { describe, expect, it } from 'vitest'
import { serverFiguresFrom } from './serverFigures'

const UP = { status: 'UP' }

describe('serverFiguresFrom', () => {
  it('reads the uptime and both CPU loads off the scrape', () => {
    const scrape = [
      '# HELP process_uptime_seconds The uptime of the Java virtual machine',
      '# TYPE process_uptime_seconds gauge',
      'process_uptime_seconds 3412.5',
      '# TYPE process_cpu_usage gauge',
      'process_cpu_usage 0.034',
      '# TYPE system_cpu_usage gauge',
      'system_cpu_usage 0.21',
    ].join('\n')

    expect(serverFiguresFrom(scrape, UP)).toMatchObject({
      uptimeSeconds: 3412.5,
      processCpu: 0.034,
      systemCpu: 0.21,
    })
  })

  // G1 reports no max for Eden and Survivor (-1), and non-heap is not the heap.
  it("sums the heap pools' use and limits, ignoring a pool without a limit", () => {
    const scrape = [
      'jvm_memory_max_bytes{area="heap",id="G1 Eden Space"} -1.0',
      'jvm_memory_max_bytes{area="heap",id="G1 Old Gen"} 2.68435456E8',
      'jvm_memory_max_bytes{area="heap",id="G1 Survivor Space"} -1.0',
      'jvm_memory_max_bytes{area="nonheap",id="Compressed Class Space"} 1.073741824E9',
      'jvm_memory_used_bytes{area="heap",id="G1 Eden Space"} 2.5165824E7',
      'jvm_memory_used_bytes{area="heap",id="G1 Old Gen"} 4.8111552E7',
      'jvm_memory_used_bytes{area="heap",id="G1 Survivor Space"} 3473408.0',
      'jvm_memory_used_bytes{area="nonheap",id="Metaspace"} 9.6907968E7',
    ].join('\n')

    expect(serverFiguresFrom(scrape, UP)).toMatchObject({
      heapUsedBytes: 25_165_824 + 48_111_552 + 3_473_408,
      heapMaxBytes: 268_435_456,
    })
  })

  it('totals the GC pauses of every collector and cause', () => {
    const scrape = [
      'jvm_gc_pause_seconds_count{action="end of minor GC",cause="G1 Evacuation Pause",gc="G1 Young Generation"} 1311',
      'jvm_gc_pause_seconds_sum{action="end of minor GC",cause="G1 Evacuation Pause",gc="G1 Young Generation"} 4.7',
      'jvm_gc_pause_seconds_count{action="end of major GC",cause="System.gc()",gc="G1 Old Generation"} 6',
      'jvm_gc_pause_seconds_sum{action="end of major GC",cause="System.gc()",gc="G1 Old Generation"} 0.12',
      'jvm_gc_pause_seconds_max{action="end of minor GC",cause="G1 Evacuation Pause",gc="G1 Young Generation"} 0.02',
    ].join('\n')

    expect(serverFiguresFrom(scrape, UP)).toMatchObject({
      gcPauseTotalSeconds: 4.82,
      gcPauseCount: 1317,
    })
  })

  it("reads the server's health and its data volume's disk off the health read", () => {
    const health = {
      status: 'DOWN',
      components: {
        db: { status: 'UP' },
        diskSpace: {
          status: 'DOWN',
          details: {
            total: 41_943_040_000,
            free: 943_718_400,
            threshold: 1_073_741_824,
            path: '/data',
            exists: true,
          },
        },
      },
    }

    expect(serverFiguresFrom('', health)).toMatchObject({
      health: 'DOWN',
      diskTotalBytes: 41_943_040_000,
      diskFreeBytes: 943_718_400,
    })
  })

  describe('endpoints', () => {
    const series = (
      method: string,
      uri: string,
      outcome: string,
      { count = 0, p50 = 0, p95 = 0 } = {},
    ) => {
      const labels = `method="${method}",outcome="${outcome}",uri="${uri}"`
      return [
        `http_server_requests_seconds{${labels},quantile="0.5"} ${p50}`,
        `http_server_requests_seconds{${labels},quantile="0.95"} ${p95}`,
        `http_server_requests_seconds_count{${labels}} ${count}`,
        `http_server_requests_seconds_sum{${labels}} ${count * p50}`,
        `http_server_requests_seconds_max{${labels}} ${p95}`,
      ]
    }
    const endpointsOf = (...lines: string[][]) =>
      serverFiguresFrom(lines.flat().join('\n'), UP).endpoints

    it("draws an endpoint's p50 and p95 in milliseconds", () => {
      expect(
        endpointsOf(
          series('GET', '/api/summary', 'SUCCESS', {
            count: 812,
            p50: 0.019,
            p95: 0.074,
          }),
        ),
      ).toEqual([
        {
          method: 'GET',
          uri: '/api/summary',
          count: 812,
          serverErrors: 0,
          p50Ms: 19,
          p95Ms: 74,
        },
      ])
    })

    // A percentile can't be merged across outcomes, so the row times its successes.
    it('counts every outcome of an endpoint in one row, timed by its successes', () => {
      expect(
        endpointsOf(
          series('GET', '/api/foods/barcode/{barcode}', 'CLIENT_ERROR', {
            count: 9,
            p50: 0.9,
            p95: 1.2,
          }),
          series('GET', '/api/foods/barcode/{barcode}', 'SUCCESS', {
            count: 12,
            p50: 0.214,
            p95: 0.38,
          }),
          series('GET', '/api/foods/barcode/{barcode}', 'SERVER_ERROR', {
            count: 2,
            p50: 8,
            p95: 8,
          }),
        ),
      ).toEqual([
        {
          method: 'GET',
          uri: '/api/foods/barcode/{barcode}',
          count: 23,
          serverErrors: 2,
          p50Ms: 214,
          p95Ms: 380,
        },
      ])
    })

    it('times an endpoint only once five requests have succeeded', () => {
      const [five, four] = endpointsOf(
        series('PUT', '/api/foods/{id}', 'SUCCESS', {
          count: 5,
          p50: 0.022,
          p95: 0.035,
        }),
        series('DELETE', '/api/entries/{id}', 'SUCCESS', {
          count: 4,
          p50: 0.012,
          p95: 0.03,
        }),
        series('DELETE', '/api/entries/{id}', 'CLIENT_ERROR', {
          count: 3,
          p50: 0.01,
          p95: 0.01,
        }),
      )

      expect(five).toMatchObject({ p50Ms: 22, p95Ms: 35 })
      expect(four).toMatchObject({ count: 7, p50Ms: null, p95Ms: null })
    })

    it('times each method on a shared path by its own requests', () => {
      const rows = endpointsOf(
        series('GET', '/api/entries/{id}', 'SUCCESS', {
          count: 40,
          p50: 0.004,
          p95: 0.009,
        }),
        series('DELETE', '/api/entries/{id}', 'SUCCESS', {
          count: 6,
          p50: 0.012,
          p95: 0.03,
        }),
      )

      expect(rows).toEqual([
        expect.objectContaining({ method: 'DELETE', p50Ms: 12, p95Ms: 30 }),
        expect.objectContaining({ method: 'GET', p50Ms: 4, p95Ms: 9 }),
      ])
    })

    it('lists an endpoint timed under half a millisecond above those too few to time', () => {
      const uris = endpointsOf(
        series('POST', '/api/weekly-review', 'SUCCESS', { count: 1 }),
        series('GET', '/api/version', 'SUCCESS', {
          count: 30,
          p50: 0.0002,
          p95: 0.0004,
        }),
      ).map((e) => e.uri)

      expect(uris).toEqual(['/api/version', '/api/weekly-review'])
    })

    it('lists the slowest p95 first and the endpoints too few to time last', () => {
      const uris = endpointsOf(
        series('POST', '/api/weekly-review', 'SUCCESS', { count: 1, p95: 2 }),
        series('GET', '/api/me', 'SUCCESS', { count: 977, p95: 0.011 }),
        series('GET', '/api/admin/metrics', 'SUCCESS', {
          count: 41,
          p95: 0.412,
        }),
        series('GET', '/api/summary', 'SUCCESS', { count: 812, p95: 0.074 }),
      ).map((e) => e.uri)

      expect(uris).toEqual([
        '/api/admin/metrics',
        '/api/summary',
        '/api/me',
        '/api/weekly-review',
      ])
    })
  })
})
