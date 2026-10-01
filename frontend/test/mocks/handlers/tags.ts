import { http } from '../http'

/**
 * No Tags yet: the baseline has never grouped a Food. Read by the Tag picker in
 * `/foods`' Add sheet, so any test that lands there meets it.
 */
export const tagHandlers = [
  http.get('/api/tags', ({ response }) => response(200).json([])),
]
