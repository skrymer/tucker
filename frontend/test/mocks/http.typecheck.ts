import { http } from './http'

// `pnpm typecheck` fails if any line below stops being an error: the handlers
// are only as typed as `http` is, and a degraded `paths` would type them all.
export const drift = [
  // @ts-expect-error a path the spec does not have
  http.get('/api/nope', () => undefined),
  http.get('/api/summary', ({ query, response }) => {
    // @ts-expect-error a query key the spec does not have
    query.get('day')
    // @ts-expect-error a field the response does not have
    return response(200).json({ date: '2026-06-16', calories: 1 })
  }),
  http.get('/api/check/{barcode}', ({ response }) =>
    // @ts-expect-error a status the spec does not declare
    response(418).json({ message: 'teapot' }),
  ),
]
