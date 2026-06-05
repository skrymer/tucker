import { test as base, expect } from '@nuxt/test-utils/playwright'

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
export const test = base.extend<{ freshDatabase: void }>({
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
})

export { expect }
