import { http } from '../http'

/** The address Access admitted the baseline User at. */
export const baselineEmail = 'user@example.com'

/** Who is signed in, and which build is answering. */
export const identityHandlers = [
  http.get('/api/me', ({ response }) =>
    response(200).json({ email: baselineEmail }),
  ),
  http.get('/api/version', ({ response }) =>
    response(200).json({
      version: '0.0.0-test',
      gitSha: 'test',
      builtAt: '2026-01-01T00:00:00Z',
    }),
  ),
]
