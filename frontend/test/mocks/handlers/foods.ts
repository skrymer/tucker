import type { FoodResponse } from '../../food-fixtures'
import { askedWindow, failingRead, http } from '../http'
import { byFoodName } from './catalog'

/**
 * The catalog, holding exactly [foods] and never written to — listed by name
 * as `foodCatalog` lists it, whatever order they are given in.
 */
export function catalogOf(foods: FoodResponse[]) {
  return http.get('/api/foods', ({ response }) =>
    response(200).json([...foods].sort(byFoodName)),
  )
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
    const window = askedWindow(query, { today })
    if ('refused' in window) {
      return response(400).json({ message: window.refused })
    }
    if (window.days !== 30) {
      return response(400).json({ message: 'the window must be 30 days' })
    }
    return response(200).json(ranked)
  })
}

/** A catalog read the server fails while [isDown] holds. */
export function catalogFails(isDown: () => boolean = () => true) {
  return failingRead('/api/foods', isDown)
}

/** A Frequent Foods read the server fails while [isDown] holds. */
export function frequentFoodsFail(isDown: () => boolean = () => true) {
  return failingRead('/api/foods/frequent', isDown)
}

/** An empty catalog, so nothing has been logged in the window Frequent Foods ranks. */
export const foodHandlers = [catalogOf([]), frequentFoods([])]
