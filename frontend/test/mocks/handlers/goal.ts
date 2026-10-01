import { http } from '../http'

/** No active Goal: the account is in Maintenance Mode, where both reads 404. */
export const goalHandlers = [
  http.get('/api/goal', ({ response }) =>
    response(404).json({ message: 'no active Goal' }),
  ),
  http.get('/api/goal/progress', ({ response }) =>
    response(404).json({ message: 'no active Goal' }),
  ),
]
