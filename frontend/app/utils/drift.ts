/** The backend's Drift Status on `DailySummaryResponse.driftStatus` (ADR 0008). */
export type DriftStatus =
  | 'holding'
  | 'drifting-up'
  | 'drifting-down'
  | 'gathering-data'

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
