import type { MetricEvent } from './metricQueue'

/** The part of a `web-vitals` metric Tucker reads. */
export type WebVital =
  | { name: 'LCP'; value: number }
  | { name: 'INP'; value: number; attribution: { interactionTime?: number } }

/** [vital] on the route that was showing when it happened (ADR 0038). */
export function webVitalEvent(
  vital: WebVital,
  routeAt: (at: number) => string | undefined,
): Pick<MetricEvent, 'kind' | 'route' | 'valueMs'> | undefined {
  // An LCP's value is the moment of its paint; an INP's is how long the tap took.
  const at =
    vital.name === 'LCP' ? vital.value : vital.attribution.interactionTime
  const route = at === undefined ? undefined : routeAt(at)
  if (route === undefined) return undefined
  const kind = vital.name === 'LCP' ? 'lcp' : 'inp'
  return { kind, route, valueMs: Math.round(vital.value) }
}
