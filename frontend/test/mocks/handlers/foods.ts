import { http } from '../http'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * An empty catalog, so nothing has been logged in the window Frequent Foods
 * ranks. The ranking is refused unless its window is the 30 days ending on
 * `to`, as the real endpoint refuses any other span.
 */
export const foodHandlers = [
  http.get('/api/foods', ({ response }) => response(200).json([])),
  http.get('/api/foods/frequent', ({ query, response }) => {
    const from = query.get('from')
    const to = query.get('to')
    const span =
      from && to ? (Date.parse(to) - Date.parse(from)) / DAY_MS + 1 : NaN
    if (span !== 30) {
      return response(400).json({ message: 'the window must be 30 days' })
    }
    return response(200).json([])
  }),
]
