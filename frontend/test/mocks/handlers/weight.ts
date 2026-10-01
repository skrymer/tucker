import { http } from '../http'

export const weightHandlers = [
  http.get('/api/weight/latest', ({ response }) =>
    response(200).json({ id: 1, measuredOn: '2026-05-22', weightKg: 82.4 }),
  ),
]
