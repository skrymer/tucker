import type { components } from '#open-fetch-schemas/api'
import { goalProgress } from '../../goal-fixtures'
import { http } from '../http'

type GoalProgress = components['schemas']['GoalProgressResponse']

/**
 * No Goal, ever: the baseline is in Maintenance Mode, where both reads of the
 * active Goal 404, and its history is empty.
 */
export const goalHandlers = [
  http.get('/api/goal', ({ response }) =>
    response(404).json({ message: 'no active Goal' }),
  ),
  http.get('/api/goal/progress', ({ response }) =>
    response(404).json({ message: 'no active Goal' }),
  ),
  http.get('/api/goals', ({ response }) => response(200).json([])),
]

/**
 * Goal Progress for an active Goal — `goalProgress()` with [overrides]. Answers
 * `/api/goal/progress` alone: `/api/goal` and the history stay the baseline's.
 */
export function goalInProgress(overrides: Partial<GoalProgress> = {}) {
  return http.get('/api/goal/progress', ({ response }) =>
    response(200).json(goalProgress(overrides)),
  )
}

/**
 * Goal Progress for a Goal whose target the trend has crossed, until the User
 * switches to maintenance; after that the baseline answers, which has no Goal.
 * `isActive()` is what a summary handler reads to carry the Budget the switch
 * recomputed. The switch is refused unless it says which day it is for
 * (ADR 0014). Answers Goal Progress and the switch alone: `/api/goal` and the
 * history stay the baseline's.
 */
export function reachedGoal(reachedOn: string) {
  const progress = goalProgress({
    currentTrendKg: 79.9,
    kgToGo: 0,
    percentComplete: 100,
    plannedFinishDate: reachedOn,
    reachedOn,
  })
  let active = true
  return {
    isActive: () => active,
    handlers: [
      http.get('/api/goal/progress', ({ response }) =>
        active ? response(200).json(progress) : undefined,
      ),
      http.delete('/api/goal', ({ query, response }) => {
        if (!query.get('clientToday')) {
          return response(400).json({ message: 'clientToday is required' })
        }
        active = false
        return response(204).empty()
      }),
    ],
  }
}
