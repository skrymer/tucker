import type { components } from '#open-fetch-schemas/api'
import { http } from '../http'

type Summary = components['schemas']['DailySummaryResponse']
type Targets = Pick<Summary, 'setupComplete' | 'calorieBudget' | 'proteinFloor'>

/** The baseline's targets: a 2492 kcal Calorie Budget and a 170 g Protein Floor. */
const baselineTargets: Targets = {
  setupComplete: true,
  calorieBudget: 2492,
  proteinFloor: 170,
}

/** A day with nothing logged yet, so all of any Calorie Budget remains. */
export function emptyDay(
  date: string,
  targets: Targets = baselineTargets,
): Summary {
  return {
    date,
    ...targets,
    caloriesConsumed: 0,
    proteinConsumed: 0,
    estimatedCalorieShare: 0,
    caloriesRemaining: targets.calorieBudget ?? null,
    dayStatus: null,
    entries: [],
  }
}

/** The summary of an empty day carrying [targets] — a User with no Budget, say. */
export function summaryWith(targets: Targets) {
  return http.get('/api/summary', ({ query, response }) => {
    const date = query.get('date')
    if (!date) {
      return response(400).json({ message: 'date is required' })
    }
    return response(200).json(emptyDay(date, targets))
  })
}

// The summary states the day it was asked about, as the real endpoint does.
export const summaryHandlers = [summaryWith(baselineTargets)]
