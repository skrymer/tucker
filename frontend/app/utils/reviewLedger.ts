import type { components } from '#open-fetch-schemas/api'

type WeeklyReview = components['schemas']['WeeklyReviewResponse']

export interface ReviewDelta {
  trendWeightKg: number
  maintenanceKcal: number
  calorieBudgetKcal: number
  proteinFloorG: number
}

/**
 * How a review's Maintenance was derived — the backend's Maintenance Basis enum,
 * arriving verbatim on the API response (ADR 0002: the frontend presents derived
 * domain state, it never re-derives it).
 */
export type ReviewBasis = WeeklyReview['maintenanceBasis']

export interface LedgerRow {
  review: WeeklyReview
  /** Change vs the chronologically previous review; null for the first one. */
  delta: ReviewDelta | null
}

/**
 * Badge label + Nuxt UI colour for each basis — one source of truth for both the
 * phone cards and the desktop table, so a `HELD` value can't be mislabelled as a
 * fresh formula seed in one view. Keyed on the backend enum so the only transform
 * left is presentation (enum → human label).
 */
export const REVIEW_BASIS_BADGE: Record<
  ReviewBasis,
  { label: string; color: 'primary' | 'info' | 'neutral' }
> = {
  ADAPTIVE: { label: 'Adaptive', color: 'primary' },
  HELD: { label: 'Held', color: 'info' },
  FORMULA_SEED: { label: 'Seed', color: 'neutral' },
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
    }
  })
  // History arrives oldest-first; the ledger reads newest-first.
  return rows.reverse()
}
