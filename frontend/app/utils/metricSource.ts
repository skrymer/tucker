import { detectInstalled } from '~/composables/usePwaInstall'
import { DESKTOP_QUERY } from './breakpoints'
import type { MetricEvent } from './metricQueue'

/** Where a metric is being measured: nothing in it says by whom (ADR 0038). */
export function metricSource(
  appVersion: string,
): Pick<MetricEvent, 'layout' | 'installed' | 'appVersion'> {
  return {
    layout: matchMedia(DESKTOP_QUERY).matches ? 'desktop' : 'phone',
    installed: detectInstalled(),
    appVersion,
  }
}
