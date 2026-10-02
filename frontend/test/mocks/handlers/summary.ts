import type { components } from '#open-fetch-schemas/api'
import { http, serverError } from '../http'

type DailySummary = components['schemas']['DailySummaryResponse']
type Targets = Pick<
  DailySummary,
  'setupComplete' | 'calorieBudget' | 'proteinFloor'
>

/** A day's summary without its date, which the handler states from the request. */
export type SummaryDay = Omit<DailySummary, 'date'>

/**
 * The baseline's Calorie Budget, in kcal: with no Goal it is the Maintenance
 * seed for the baseline Profile at its one reading — Mifflin-St Jeor
 * (10 × 82.4 + 6.25 × 180 − 5 × 41 + 5) × 1.4.
 */
export const baselineCalorieBudget = 2448.6

/** The baseline's Protein Floor, in grams: 2.0 g/kg of its one reading. */
export const baselineProteinFloor = 164.8

/** The baseline's targets: its Calorie Budget and Protein Floor. */
const baselineTargets: Targets = {
  setupComplete: true,
  calorieBudget: baselineCalorieBudget,
  proteinFloor: baselineProteinFloor,
}

/** No Budget yet: the first review has not run, so setup is unfinished. */
export const setupUnfinished: Targets = {
  setupComplete: false,
  calorieBudget: null,
  proteinFloor: null,
}

/** Set up, with no Budget by choice: Calorie Tracking is off. */
export const noIntakeTargets: Targets = {
  setupComplete: true,
  calorieBudget: null,
  proteinFloor: null,
}

/** A day with nothing logged yet, so all of any Calorie Budget remains. */
function emptyDay(targets: Targets): SummaryDay {
  return {
    ...targets,
    caloriesConsumed: 0,
    proteinConsumed: 0,
    estimatedCalorieShare: 0,
    caloriesRemaining: targets.calorieBudget ?? null,
    dayStatus: null,
    entries: [],
  }
}

/**
 * The summary of whichever day is asked about, stating that day as the real
 * endpoint does. Pass a getter for a day that changes under the page — after a
 * mutation the next read carries what the backend recomputed.
 */
export function summaryOf(day: SummaryDay | (() => SummaryDay)) {
  return http.get('/api/summary', ({ query, response }) => {
    const date = query.get('date')
    if (!date) {
      return response(400).json({ message: 'date is required' })
    }
    const fields = typeof day === 'function' ? day() : day
    return response(200).json({ ...fields, date })
  })
}

/**
 * A summary read the server fails. Every time, not once: ofetch retries a
 * failed GET by itself, and a retry reaching the baseline would hide the error.
 */
export function summaryFails() {
  return http.get('/api/summary', ({ response }) =>
    response.untyped(serverError()),
  )
}

/** The summary of an empty day carrying [targets]. */
export function summaryWith(targets: Targets) {
  return summaryOf(emptyDay(targets))
}

export const summaryHandlers = [summaryWith(baselineTargets)]
