import type { components } from '#open-fetch-schemas/api'
import { http } from '../http'

type Summary = components['schemas']['DailySummaryResponse']

/**
 * A day with nothing logged yet, against the targets the Check fixtures are
 * measured by: a 2492 kcal Calorie Budget and a 170 g Protein Floor.
 */
export function emptyDay(date: string): Summary {
  return {
    date,
    setupComplete: true,
    caloriesConsumed: 0,
    proteinConsumed: 0,
    estimatedCalorieShare: 0,
    calorieBudget: 2492,
    proteinFloor: 170,
    caloriesRemaining: 2492,
    dayStatus: null,
    entries: [],
  }
}

export const summaryHandlers = [
  // The summary states the day it was asked about, as the real endpoint does.
  http.get('/api/summary', ({ query, response }) => {
    const date = query.get('date')
    if (!date) {
      return response(400).json({ message: 'date is required' })
    }
    return response(200).json(emptyDay(date))
  }),
]
