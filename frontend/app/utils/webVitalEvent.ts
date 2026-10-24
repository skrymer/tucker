import type { MetricEvent } from './metricQueue'

/** The part of a `web-vitals` metric Tucker reads. */
export type WebVital =
  | { name: 'LCP'; value: number }
  | { name: 'INP'; value: number; entries: { startTime: number }[] }

export type WebVitalEvent = Pick<MetricEvent, 'kind' | 'route' | 'valueMs'>

/** [vital] on the route that was showing when it happened (ADR 0038). */
export function webVitalEvent(
  vital: WebVital,
  routeAt: (at: number) => string | undefined,
): WebVitalEvent | undefined {
  // An LCP's value is the moment of its paint; an INP's is how long the tap took,
  // and its first event entry is when the tap began.
  const [kind, at] =
    vital.name === 'LCP'
      ? (['lcp', vital.value] as const)
      : (['inp', vital.entries[0]?.startTime] as const)
  const route = at === undefined ? undefined : routeAt(at)
  if (route === undefined) return undefined
  return { kind, route, valueMs: Math.round(vital.value) }
}
