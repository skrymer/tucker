import { test as base, expect } from '@nuxt/test-utils/playwright'
import { watchPageErrors, MOCKED_E2E_NOISE } from './console-guard'

/**
 * Shared `test` for the mocked (`/api/*` stubbed) Playwright e2e suite. Extends
 * the Nuxt base with an auto guard that fails a test on any unexpected console
 * error, uncaught exception, or failed request — the silent regression class the
 * mocked suite never asserted on before (#85). Known-benign noise is allowlisted
 * in `console-guard.ts`.
 */
export const test = base.extend<{ noPageErrors: void }>({
  noPageErrors: [
    async ({ page }, use) => {
      const problems = watchPageErrors(page, MOCKED_E2E_NOISE)
      await use()
      expect(
        problems(),
        `Unexpected page errors:\n${problems().join('\n')}`,
      ).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
