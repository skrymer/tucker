import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test'
import { test as base, expect } from '@nuxt/test-utils/playwright'
import { assertNoPageErrors, SMOKE_NOISE } from '../../support/console-guard'
import {
  ACCESS_ASSERTION_HEADER,
  mintAccessToken,
} from '../../../scripts/access-token.mjs'
import { CSRF_COOKIE, CSRF_HEADER } from '../../../app/utils/csrf'

const API = 'http://localhost:8080/api'

// Shared `test` for the real-stack smokes. Every smoke runs against one shared
// backend database, and a WeeklyReview is irreversible by design (no delete
// path) — so without intervention, reviews created by one test drag down the
// adaptive-maintenance baseline of later tests in the same run, making budget
// assertions non-deterministic (issue #70).
//
// This auto fixture empties the database before each test via the
// smoke-profile-gated POST /api/test/reset (see TestSupportController.kt), so
// every smoke starts from a truly blank, freshly-migrated slate. Combined with
// the disposable per-run database (docker-compose.smoke.yml + global setup),
// nothing leaks between tests or between runs. Tests still seed whatever they
// need in their own body.
export const test = base.extend<{
  // `void` is Playwright's declared type for a fixture that yields no value —
  // the framework's own idiom, not a misused void.
  /* eslint-disable @typescript-eslint/no-invalid-void-type */
  freshDatabase: void
  noPageErrors: void
  /* eslint-enable @typescript-eslint/no-invalid-void-type */
  /**
   * Extra page-error patterns a single smoke tolerates on top of [SMOKE_NOISE] —
   * for a test that *deliberately* induces a failure (e.g. the offline-lookup
   * smoke aborts the barcode request). Set per-file with
   * `test.use({ allowedErrors: [/…/] })`; keep each entry scoped and commented.
   */
  allowedErrors: RegExp[]
  /**
   * An API context acting as a *different* User, for the cross-user isolation
   * smokes. Built only by the tests that ask for it (Playwright fixtures are
   * lazy), so no other smoke pays to mint a second assertion.
   */
  otherUser: APIRequestContext
}>({
  allowedErrors: [[], { option: true }],
  // The API the smokes seed and clean up through is gated now (ADR 0020), so this
  // context carries a real assertion minted with the committed non-production key —
  // every seeding call goes through the backend's real decoder. Minting per test
  // rather than per run means switching identity is one line, which is what makes
  // cross-user isolation testable once Users arrive (F10 #157).
  //
  // A context of its own rather than the `extraHTTPHeaders` option, which looks
  // like the obvious way to do this and is a trap: that option applies to the
  // *browser* too, and an unrecognised request header turns the SPA's cross-origin
  // icon fetches into preflighted ones that api.iconify.design refuses. The
  // browser gets its credential a different way — see global-backend.setup.ts.
  request: async ({ playwright }, use) => {
    const api = await signedInApi(playwright)
    await use(api)
    await api.dispose()
  },
  // Somebody else entirely — the second identity the isolation smokes need
  // (F10 #157, #158). It is the [request] fixture with a different email, which
  // is the whole point of minting per test: switching identity really is one
  // line. A fixture rather than a `newContext` in each test body so disposal is
  // Playwright's job and the tests do not each carry a `try`/`finally`.
  otherUser: async ({ playwright }, use) => {
    const api = await signedInApi(playwright, 'someone.else@tucker.invalid')
    await use(api)
    await api.dispose()
  },
  freshDatabase: [
    async ({ request }, use) => {
      const res = await request.post(`${API}/test/reset`)
      if (!res.ok()) {
        throw new Error(`DB reset failed: ${res.status()} ${await res.text()}`)
      }
      await use()
    },
    { auto: true },
  ],
  // Fail a smoke on any unexpected console error, uncaught exception, or failed
  // request — the silent regression class smokes never caught before (#85).
  noPageErrors: [
    ({ page, allowedErrors }, use) =>
      assertNoPageErrors(page, use, [...SMOKE_NOISE, ...allowedErrors]),
    { auto: true },
  ],
})

/**
 * An API context that seeds and cleans up as one User — signed in, and holding a CSRF
 * token the way a browser holds one (ADR 0025).
 *
 * Two contexts because `extraHTTPHeaders` is fixed when a context is made and
 * `APIRequestContext` has no way to add one later, while the token only exists once
 * Tucker has handed one out. So the first context asks for it and the second inherits its
 * cookie jar and echoes the value back in the header.
 */
async function signedInApi(
  playwright: PlaywrightWorkerArgs['playwright'],
  email?: string,
): Promise<APIRequestContext> {
  const extraHTTPHeaders = {
    [ACCESS_ASSERTION_HEADER]: await mintAccessToken({ email }),
  }
  const handingOut = await playwright.request.newContext({ extraHTTPHeaders })
  // Any GET; the cookie rides back on every response. Checked, because every smoke shares
  // this fixture: unchecked, a backend that is down or an assertion it rejects both surface
  // below as "handed out no XSRF-TOKEN cookie", pointing the whole suite at the CSRF layer
  // for a fault in auth or availability.
  const handOut = await handingOut.get(`${API}/version`)
  if (!handOut.ok()) {
    throw new Error(
      `could not ask for a CSRF token: ${handOut.status()} ${await handOut.text()}`,
    )
  }
  const storageState = await handingOut.storageState()
  await handingOut.dispose()

  const token = storageState.cookies.find((c) => c.name === CSRF_COOKIE)
  if (!token) throw new Error(`the backend handed out no ${CSRF_COOKIE} cookie`)

  return playwright.request.newContext({
    storageState,
    extraHTTPHeaders: { ...extraHTTPHeaders, [CSRF_HEADER]: token.value },
  })
}

export { expect }
