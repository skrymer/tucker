import { nutellaCheck } from '../../check-fixtures'
import { http } from '../http'

export const checkHandlers = [
  // Nutella is in the food database; every other barcode is a miss. A lookup
  // that does not say which day it is for is refused, as the endpoint resolves
  // the targets standing on the client's day (ADR 0014).
  http.get('/api/check/{barcode}', ({ params, query, response }) => {
    if (!query.get('clientToday')) {
      return response(400).json({ message: 'clientToday is required' })
    }
    if (params.barcode !== nutellaCheck.barcode) {
      return response(404).json({
        message: `no product for barcode ${params.barcode}`,
      })
    }
    return response(200).json(nutellaCheck)
  }),
]

/**
 * A lookup with targets standing on [day] alone: asked about any other day it
 * refuses, which the page shows as a lookup that did not get through.
 */
export function checkOnlyOn(day: string) {
  return http.get('/api/check/{barcode}', ({ query, response }) =>
    query.get('clientToday') === day
      ? response(200).json(nutellaCheck)
      : response(409).json({
          message: 'a Check needs a Calorie Budget; finish setup first',
        }),
  )
}
