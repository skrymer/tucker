import type { components } from '#open-fetch-schemas/api'
import { http } from '../http'

type Search = components['schemas']['ReferenceFoodSearchResponse']

const nothing: Search = { suggestedId: null, candidates: [] }

/**
 * The Reference Food search answering each query in [answers] with its search,
 * and any other query — a blank one included — with nothing at all.
 */
export function referenceFoodsFor(answers: Record<string, Search>) {
  return http.get('/api/reference-foods', ({ query, response }) =>
    response(200).json(answers[query.get('q') ?? ''] ?? nothing),
  )
}

/** No Reference Food is like any Food. */
export const referenceFoodHandlers = [referenceFoodsFor({})]
