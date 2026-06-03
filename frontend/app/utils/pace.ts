/** The backend's observed-pace classification on `GoalProgressResponse.paceStatus`. */
export type PaceStatus = 'behind' | 'on-pace' | 'ahead' | 'stalled'

/** A pace badge's colour — a subset of Nuxt UI's badge colours. */
export type PaceColor = 'success' | 'warning' | 'neutral'

/**
 * Presentation for an observed-[PaceStatus]: a human label and a badge colour.
 * On-pace and ahead read as success, behind as a warning, and a stalled trend
 * (no loss) as neutral. The classification itself is the backend's; this maps it
 * to how it looks (ADR 0002).
 */
export function paceBadge(status: PaceStatus): {
  label: string
  color: PaceColor
} {
  switch (status) {
    case 'ahead':
      return { label: 'Ahead', color: 'success' }
    case 'on-pace':
      return { label: 'On pace', color: 'success' }
    case 'behind':
      return { label: 'Behind', color: 'warning' }
    case 'stalled':
      return { label: 'Stalled', color: 'neutral' }
  }
}
