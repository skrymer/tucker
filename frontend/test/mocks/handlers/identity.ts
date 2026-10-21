import { http } from '../http'

/** The address Access admitted the baseline User at. */
export const baselineEmail = 'user@example.com'

/** The baseline User, listed in `TUCKER_ADMIN_EMAILS` (ADR 0039). */
export const signedInAsAdmin = http.get('/api/me', ({ response }) =>
  response(200).json({ email: baselineEmail, admin: true }),
)

/** Who is signed in, and which build is answering. The baseline is no Admin. */
export const identityHandlers = [
  http.get('/api/me', ({ response }) =>
    response(200).json({ email: baselineEmail, admin: false }),
  ),
  http.get('/api/version', ({ response }) =>
    response(200).json({
      version: '0.0.0-test',
      gitSha: 'test',
      builtAt: '2026-01-01T00:00:00Z',
    }),
  ),
]
