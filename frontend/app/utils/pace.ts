import type { components } from '#open-fetch-schemas/api'

type GoalProgress = components['schemas']['GoalProgressResponse']

/**
 * The backend's observed-pace classification, arriving verbatim on the API
 * response. Taken from the spec rather than restated here, so the set cannot
 * drift from the one the backend actually sends.
 */
export type PaceStatus = NonNullable<GoalProgress['paceStatus']>

/** A pace badge's colour — a subset of Nuxt UI's badge colours. */
export type PaceColor = 'success' | 'warning' | 'neutral'

/**
 * Presentation for an observed-[PaceStatus]: a human label and a badge colour.
 * On-pace and ahead read as success, behind as a warning, and a stalled trend
 * (no loss) as neutral. The classification itself is the backend's; this maps it
 * to how it looks (ADR 0002).
 *
 * A withheld status — the backend has too few Weight Measurements to classify
 * one — has no badge rather than an empty one, so every caller gets that answer
 * from here instead of restating it.
 */
export function paceBadge(status: PaceStatus | null | undefined): {
  label: string
  color: PaceColor
} | null {
  if (!status) return null
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
