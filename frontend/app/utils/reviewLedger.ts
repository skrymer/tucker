import type { components } from '#open-fetch-schemas/api'

type WeeklyReview = components['schemas']['WeeklyReviewResponse']

export interface ReviewDelta {
  trendWeightKg: number
  maintenanceKcal: number
  calorieBudgetKcal: number
  proteinFloorG: number
}

/** How a review's Maintenance was derived: measured, carried over, or the formula seed. */
export type ReviewBasis = 'adaptive' | 'held' | 'seed'

export interface LedgerRow {
  review: WeeklyReview
  /** Change vs the chronologically previous review; null for the first one. */
  delta: ReviewDelta | null
  /** How the review's Maintenance was derived — drives the row's badge. */
  basis: ReviewBasis
}

/**
 * Badge label + Nuxt UI colour for each basis — one source of truth for both the
 * phone cards and the desktop table, so a `held` value can't be mislabelled as a
 * fresh formula seed in one view.
 */
export const REVIEW_BASIS_BADGE: Record<
  ReviewBasis,
  { label: string; color: 'primary' | 'info' | 'neutral' }
> = {
  adaptive: { label: 'Adaptive', color: 'primary' },
  held: { label: 'Held', color: 'info' },
  seed: { label: 'Seed', color: 'neutral' },
}

// The API exposes the basis only inside the human-readable note ("Maintenance
// basis: ADAPTIVE" / "HELD" / "FORMULA_SEED") — the one signal we have without new
// backend work. Absent/unknown notes read as seed.
function basisFromNote(note: string | null | undefined): ReviewBasis {
  if (note?.includes('ADAPTIVE')) return 'adaptive'
  if (note?.includes('HELD')) return 'held'
  return 'seed'
}

export function toLedgerRows(history: WeeklyReview[]): LedgerRow[] {
  const rows = history.map((review, i) => {
    const previous = history[i - 1]
    return {
      review,
      delta: previous
        ? {
            trendWeightKg: review.trendWeightKg - previous.trendWeightKg,
            maintenanceKcal: review.maintenanceKcal - previous.maintenanceKcal,
            calorieBudgetKcal:
              review.calorieBudgetKcal - previous.calorieBudgetKcal,
            proteinFloorG: review.proteinFloorG - previous.proteinFloorG,
          }
        : null,
      basis: basisFromNote(review.note),
    }
  })
  // History arrives oldest-first; the ledger reads newest-first.
  return rows.reverse()
}
