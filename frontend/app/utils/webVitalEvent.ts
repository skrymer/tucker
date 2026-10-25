import type { MetricEvent } from './metricQueue'

/** The part of a `web-vitals` metric Tucker reads. */
export type WebVital =
  | { name: 'LCP'; value: number; entries: unknown[] }
  | { name: 'INP'; value: number; entries: { startTime: number }[] }

export type WebVitalEvent = Pick<MetricEvent, 'kind' | 'route' | 'valueMs'>

/** The server refuses a longer time, and the batch carrying it with it (ADR 0038). */
const MAX_MS = 60_000

/** [vital] on the route that was showing when it happened (ADR 0038). */
export function webVitalEvent(
  vital: WebVital,
  routeAt: (at: number) => string | undefined,
): WebVitalEvent | undefined {
  // An LCP's value is the moment of its paint, unless it has no paint entry (a
  // restore, timed from the restore); an INP's is how long the tap took, and its
  // first event entry is when the tap began.
  const [kind, at] =
    vital.name === 'LCP'
      ? (['lcp', vital.entries.length ? vital.value : undefined] as const)
      : (['inp', vital.entries[0]?.startTime] as const)
  const route = at === undefined ? undefined : routeAt(at)
  const valueMs = Math.round(vital.value)
  if (route === undefined || valueMs > MAX_MS) return undefined
  return { kind, route, valueMs }
}
