import { test as base, expect } from '@nuxt/test-utils/playwright'
import { assertNoPageErrors, MOCKED_E2E_NOISE } from './console-guard'

/**
 * Shared `test` for the mocked (`/api/*` stubbed) Playwright e2e suite. Extends
 * the Nuxt base with an auto guard that fails a test on any unexpected console
 * error, uncaught exception, or failed request — the silent regression class the
 * mocked suite never asserted on before (#85). Known-benign noise is allowlisted
 * in `console-guard.ts`.
 */
// `void` is Playwright's declared type for a fixture that yields no value —
// the framework's own idiom, not a misused void.
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export const test = base.extend<{ noPageErrors: void }>({
  noPageErrors: [
    ({ page }, use) => assertNoPageErrors(page, use, MOCKED_E2E_NOISE),
    { auto: true },
  ],
})

export { expect }
