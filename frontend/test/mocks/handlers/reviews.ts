import type { components } from '#open-fetch-schemas/api'
import { intakeTargets, weeklyReview } from '../../review-fixtures'
import { failingRead, http } from '../http'
import { baselineCalorieBudget, baselineProteinFloor } from './summary'
import { baselineReading } from './weight'

type Review = components['schemas']['WeeklyReviewResponse']

/**
 * The baseline's one Weekly Review: the first, run the day it weighed in, so
 * its Maintenance is the formula seed and — with no Goal — its Budget too.
 */
const baselineReview = weeklyReview({
  id: 1,
  reviewedOn: baselineReading.measuredOn,
  trendWeightKg: baselineReading.weightKg,
  intakeTargets: intakeTargets({
    maintenanceKcal: baselineCalorieBudget,
    maintenanceBasis: 'FORMULA_SEED',
    calorieBudgetKcal: baselineCalorieBudget,
    proteinFloorG: baselineProteinFloor,
  }),
})

/**
 * The Weekly Review history holding exactly [reviews], listed oldest first as
 * the backend lists them, whatever order they are given in.
 */
export function reviewHistory(reviews: Review[]) {
  const listed = [...reviews].sort((a, b) =>
    a.reviewedOn.localeCompare(b.reviewedOn),
  )
  return http.get('/api/weekly-review/history', ({ response }) =>
    response(200).json(listed),
  )
}

/** A Weekly Review history read the server fails while [isDown] holds. */
export function reviewHistoryFails(isDown: () => boolean = () => true) {
  return failingRead('/api/weekly-review/history', isDown)
}

export const reviewHandlers = [reviewHistory([baselineReview])]
