import { test, expect } from './support/smoke-test'

const API = 'http://localhost:8080/api'

// Every other smoke reaches the API through a context that already carries an Access
// assertion, so they prove the gate lets the right callers *in* — and would go on passing
// if it let everyone in. This is the other half: a caller with no assertion at all, over a
// real socket, against the real container.
//
// It uses its own request context rather than the suite's, precisely because the suite's
// is signed in (see support/smoke-test.ts).
test('the API refuses a caller with no Access assertion, but still says it is alive', async ({
  playwright,
}) => {
  const anonymous = await playwright.request.newContext()

  try {
    const gated = await anonymous.get(`${API}/foods`)
    expect(
      gated.status(),
      'a gated path must refuse an unauthenticated caller',
    ).toBe(401)

    // The one door left open, so an operator can tell "down" from "rejecting me".
    const version = await anonymous.get(`${API}/version`)
    expect(
      version.status(),
      '/api/version must answer without an assertion',
    ).toBe(200)
    expect(await version.json()).toHaveProperty('version')
  } finally {
    await anonymous.dispose()
  }
})
