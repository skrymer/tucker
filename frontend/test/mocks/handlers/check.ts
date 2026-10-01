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
