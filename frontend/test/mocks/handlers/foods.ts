import type { FoodResponse } from '../../food-fixtures'
import { http, serverError } from '../http'

const DAY_MS = 24 * 60 * 60 * 1000

/** The catalog, holding exactly [foods]. */
export function catalogOf(foods: FoodResponse[]) {
  return http.get('/api/foods', ({ response }) => response(200).json(foods))
}

/**
 * Frequent Foods ranked as [ranked], first to last. The ranking is refused
 * unless its window spans 30 days, as the real endpoint refuses any other span.
 * Given [today], a window ending on any other day is refused too — a refusal
 * the real endpoint does not make, standing in for a page that asked about the
 * wrong day (ADR 0014).
 */
export function frequentFoods(
  ranked: FoodResponse[],
  { today }: { today?: string } = {},
) {
  return http.get('/api/foods/frequent', ({ query, response }) => {
    const from = query.get('from')
    const to = query.get('to')
    const span =
      from && to ? (Date.parse(to) - Date.parse(from)) / DAY_MS + 1 : NaN
    if (span !== 30) {
      return response(400).json({ message: 'the window must be 30 days' })
    }
    if (today && to !== today) {
      return response(400).json({ message: `${to} is not today` })
    }
    return response(200).json(ranked)
  })
}

/**
 * A read of [path] the server fails while [isDown] holds, falling through to the
 * handler under it once it does not. Every time, not once: ofetch retries a
 * failed GET by itself.
 */
function failing(
  path: '/api/foods' | '/api/foods/frequent',
  isDown: () => boolean,
) {
  return http.get(path, ({ response }) =>
    isDown() ? response.untyped(serverError()) : undefined,
  )
}

/** A catalog read the server fails while [isDown] holds. */
export function catalogFails(isDown: () => boolean = () => true) {
  return failing('/api/foods', isDown)
}

/** A Frequent Foods read the server fails while [isDown] holds. */
export function frequentFoodsFail(isDown: () => boolean = () => true) {
  return failing('/api/foods/frequent', isDown)
}

/** An empty catalog, so nothing has been logged in the window Frequent Foods ranks. */
export const foodHandlers = [catalogOf([]), frequentFoods([])]
