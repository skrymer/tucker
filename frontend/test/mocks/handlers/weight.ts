import type { components } from '#open-fetch-schemas/api'
import { http } from '../http'

type Reading = components['schemas']['WeightMeasurementResponse']

/** A reading long before any day a test runs on, so "today" is never weighed. */
export const baselineReading: Reading = {
  id: 1,
  measuredOn: '2026-05-22',
  weightKg: 82.4,
}

export const weightHandlers = [
  http.get('/api/weight/latest', ({ response }) =>
    response(200).json(baselineReading),
  ),
  http.get('/api/weight', ({ response }) =>
    response(200).json([baselineReading]),
  ),
  // One reading is a trend standing where that reading does.
  http.get('/api/weight/trend', ({ response }) =>
    response(200).json({
      trendKg: baselineReading.weightKg,
      asOf: baselineReading.measuredOn,
    }),
  ),
]

/**
 * A scale that remembers: the latest reading is [initial] (null for none yet)
 * until a Weight Measurement is saved, which the next read of the latest then
 * returns.
 * Answers the latest reading and the save alone: the list and the trend stay
 * the baseline's.
 */
export function weightMeasurements(initial: Reading | null) {
  let latest = initial
  let nextId = (initial?.id ?? 0) + 1
  return [
    http.get('/api/weight/latest', ({ response }) =>
      latest === null
        ? response(404).json({ message: 'no weight measurements yet' })
        : response(200).json(latest),
    ),
    http.post('/api/weight', async ({ request, response }) => {
      const { date, weightKg } = await request.json()
      latest = { id: nextId++, measuredOn: date, weightKg }
      return response(200).json(latest)
    }),
  ]
}
