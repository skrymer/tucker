export type ServerEndpoint = {
  method: string
  uri: string
  /** Every request since the last restart, any outcome. */
  count: number
  /** Requests answered 5xx. */
  serverErrors: number
  /** Of its successes alone; null while fewer than five have succeeded. */
  p50Ms: number | null
  p95Ms: number | null
}

/** The server's own figures, all since the last restart but the meters that read now. */
export type ServerFigures = {
  /** Actuator's status: `UP`, or what made it otherwise. */
  health: string
  uptimeSeconds: number
  /** 0–1 */
  processCpu: number
  /** 0–1, the host's load as the container sees it. */
  systemCpu: number
  heapUsedBytes: number
  heapMaxBytes: number
  gcPauseTotalSeconds: number
  gcPauseCount: number
  diskTotalBytes: number
  diskFreeBytes: number
  /** Slowest p95 first, those too few to time last. */
  endpoints: ServerEndpoint[]
}

/** What `/api/actuator/health` answers, as far as the server section reads it. */
export type ActuatorHealth = {
  status: string
  components?: {
    diskSpace?: { details?: { total?: number; free?: number } }
  }
}

type Sample = { name: string; labels: Record<string, string>; value: number }

const SAMPLE = /^(\w+)(?:\{(.*)\})?\s+(\S+)/
const LABEL = /(\w+)="((?:[^"\\]|\\.)*)"/g

/** One sample per line of Prometheus' text format; `#` lines are its comments. */
function samplesOf(scrape: string): Sample[] {
  return scrape.split('\n').flatMap((line) => {
    const match = SAMPLE.exec(line)
    if (!match) return []
    const [, name = '', labels = '', value = ''] = match
    return [
      {
        name,
        labels: Object.fromEntries(
          [...labels.matchAll(LABEL)].map(([, key, v]) => [key, v]),
        ),
        value: Number(value),
      },
    ]
  })
}

const sum = (samples: Sample[]) => samples.reduce((s, x) => s + x.value, 0)

const REQUESTS = 'http_server_requests_seconds'
/** Fewer successes than this are too few to time. */
const FEWEST_TIMED = 5

/**
 * One endpoint from the `_count` of each of its outcomes. A percentile can't be merged
 * across outcomes, so the row is timed by its successes alone.
 */
function endpointFrom(outcomes: Sample[], samples: Sample[]): ServerEndpoint {
  const { method = '', uri = '' } = outcomes[0]?.labels ?? {}
  const of = (outcome: string) =>
    outcomes.find((s) => s.labels.outcome === outcome)
  const timed = (of('SUCCESS')?.value ?? 0) >= FEWEST_TIMED
  const quantileMs = (quantile: string) => {
    if (!timed) return null
    const q = samples.find(
      (s) =>
        s.name === REQUESTS &&
        s.labels.quantile === quantile &&
        s.labels.method === method &&
        s.labels.uri === uri &&
        s.labels.outcome === 'SUCCESS',
    )
    return q ? Math.round(q.value * 1000) : null
  }
  return {
    method,
    uri,
    count: sum(outcomes),
    serverErrors: of('SERVER_ERROR')?.value ?? 0,
    p50Ms: quantileMs('0.5'),
    p95Ms: quantileMs('0.95'),
  }
}

function endpointsOf(samples: Sample[]): ServerEndpoint[] {
  const byEndpoint = Map.groupBy(
    samples.filter((s) => s.name === `${REQUESTS}_count`),
    (s) => `${s.labels.method} ${s.labels.uri}`,
  )
  return [...byEndpoint.values()]
    .map((outcomes) => endpointFrom(outcomes, samples))
    .sort((a, b) => (b.p95Ms ?? -1) - (a.p95Ms ?? -1))
}

/** The server section's figures, from one `prometheus` scrape and one `health` read. */
export function serverFiguresFrom(
  scrape: string,
  health: ActuatorHealth,
): ServerFigures {
  const samples = samplesOf(scrape)
  const named = (name: string) => samples.filter((s) => s.name === name)
  const gauge = (name: string) => named(name)[0]?.value ?? 0
  // A pool without a limit reports -1 (G1's Eden and Survivor).
  const heap = (name: string) =>
    sum(named(name).filter((s) => s.labels.area === 'heap' && s.value > 0))
  const disk = health.components?.diskSpace?.details
  return {
    health: health.status,
    uptimeSeconds: gauge('process_uptime_seconds'),
    processCpu: gauge('process_cpu_usage'),
    systemCpu: gauge('system_cpu_usage'),
    heapUsedBytes: heap('jvm_memory_used_bytes'),
    heapMaxBytes: heap('jvm_memory_max_bytes'),
    gcPauseTotalSeconds: sum(named('jvm_gc_pause_seconds_sum')),
    gcPauseCount: sum(named('jvm_gc_pause_seconds_count')),
    diskTotalBytes: disk?.total ?? 0,
    diskFreeBytes: disk?.free ?? 0,
    endpoints: endpointsOf(samples),
  }
}
