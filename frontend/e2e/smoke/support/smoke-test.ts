import { test as base, expect } from '@nuxt/test-utils/playwright'
import { assertNoPageErrors, SMOKE_NOISE } from '../../support/console-guard'

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
  freshDatabase: void
  noPageErrors: void
  /**
   * Extra page-error patterns a single smoke tolerates on top of [SMOKE_NOISE] —
   * for a test that *deliberately* induces a failure (e.g. the offline-lookup
   * smoke aborts the barcode request). Set per-file with
   * `test.use({ allowedErrors: [/…/] })`; keep each entry scoped and commented.
   */
  allowedErrors: RegExp[]
}>({
  allowedErrors: [[], { option: true }],
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

export { expect }
