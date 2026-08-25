import type { components } from '#open-fetch-schemas/api'

type WeeklyReview = components['schemas']['WeeklyReviewResponse']
type IntakeTargets = NonNullable<WeeklyReview['intakeTargets']>

/** Week-over-week change in the intake half of a review. */
export interface TargetsDelta {
  maintenanceKcal: number
  calorieBudgetKcal: number
  proteinFloorG: number
}

/**
 * How a review's Maintenance was derived — the backend's Maintenance Basis enum,
 * arriving verbatim on the API response (ADR 0002: the frontend presents derived
 * domain state, it never re-derives it).
 */
export type ReviewBasis = IntakeTargets['maintenanceBasis']

export interface LedgerRow {
  review: WeeklyReview
  /** Change in Trend Weight vs the chronologically previous review; null for the first. */
  trendDelta: number | null
  /**
   * Change in the Calorie Budget, Maintenance and Protein Floor. Null unless both
   * this review and the one before it carry Intake Targets: a Budget that was
   * never published cannot have moved.
   */
  targetsDelta: TargetsDelta | null
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
      trendDelta: previous
        ? review.trendWeightKg - previous.trendWeightKg
        : null,
      targetsDelta: targetsDelta(previous?.intakeTargets, review.intakeTargets),
    }
  })
  // History arrives oldest-first; the ledger reads newest-first.
  return rows.reverse()
}

function targetsDelta(
  previous: IntakeTargets | null | undefined,
  current: IntakeTargets | null | undefined,
): TargetsDelta | null {
  if (!previous || !current) return null
  return {
    maintenanceKcal: current.maintenanceKcal - previous.maintenanceKcal,
    calorieBudgetKcal: current.calorieBudgetKcal - previous.calorieBudgetKcal,
    proteinFloorG: current.proteinFloorG - previous.proteinFloorG,
  }
}
