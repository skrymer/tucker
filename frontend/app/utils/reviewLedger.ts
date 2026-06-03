import type { components } from '#open-fetch-schemas/api'

type WeeklyReview = components['schemas']['WeeklyReviewResponse']

export interface ReviewDelta {
  trendWeightKg: number
  maintenanceKcal: number
  calorieBudgetKcal: number
  proteinFloorG: number
}

export interface LedgerRow {
  review: WeeklyReview
  /** Change vs the chronologically previous review; null for the first one. */
  delta: ReviewDelta | null
  /** Adaptive (measured) vs seed (formula) basis — drives the row's badge. */
  isAdaptive: boolean
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
      // The API exposes the basis only inside the human-readable note
      // ("Maintenance basis: ADAPTIVE" / "...FORMULA_SEED") — the one signal we
      // have without new backend work. Absent/unknown notes read as seed.
      isAdaptive: review.note?.includes('ADAPTIVE') ?? false,
    }
  })
  // History arrives oldest-first; the ledger reads newest-first.
  return rows.reverse()
}
