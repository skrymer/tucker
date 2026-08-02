import type { components } from '#open-fetch-schemas/api'

type DailySummary = components['schemas']['DailySummaryResponse']

/**
 * The backend's Drift Status (ADR 0008), arriving verbatim on the API response.
 * Taken from the spec rather than restated here, so the set cannot drift from the
 * one the backend actually sends.
 */
export type DriftStatus = NonNullable<DailySummary['driftStatus']>

/** A drift badge's colour — a subset of Nuxt UI's badge colours. */
export type DriftColor = 'success' | 'warning' | 'neutral'

/**
 * Presentation for a [DriftStatus]: a human label and a badge colour. Holding
 * reads as success, drift either way as a gentle warning, and the pre-14-day
 * gathering-data state as neutral. A displayed status, not an alert (ADR 0008);
 * the classification itself is the backend's, this only maps it (ADR 0002).
 */
export function driftBadge(status: DriftStatus): {
  label: string
  color: DriftColor
} {
  switch (status) {
    case 'holding':
      return { label: 'Holding', color: 'success' }
    case 'drifting-up':
      return { label: 'Drifting up', color: 'warning' }
    case 'drifting-down':
      return { label: 'Drifting down', color: 'warning' }
    case 'gathering-data':
      return { label: 'Gathering data', color: 'neutral' }
  }
}
