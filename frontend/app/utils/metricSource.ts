import type { MetricEvent } from './metricQueue'

/** `lg`, the app's own breakpoint, where the side nav replaces the tab bar. */
const DESKTOP_QUERY = '(min-width: 1024px)'

/** Where a metric is being measured: nothing in it says by whom (ADR 0038). */
export function metricSource(
  appVersion: string,
): Pick<MetricEvent, 'layout' | 'installed' | 'appVersion'> {
  return {
    layout: matchMedia(DESKTOP_QUERY).matches ? 'desktop' : 'phone',
    installed: matchMedia('(display-mode: standalone)').matches,
    appVersion,
  }
}
