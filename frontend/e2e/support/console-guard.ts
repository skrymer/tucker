import { expect } from '@nuxt/test-utils/playwright'
import type { Page } from '@playwright/test'

/**
 * Known, benign browser noise the error guard tolerates. Keep this list tight
 * and documented — every entry is a regression we've consciously chosen not to
 * fail on. A new, unexplained error should fail the test, not be silenced here.
 *
 * Matched against console-error text, uncaught-exception messages, failed-request
 * URLs, and failed-request error text alike.
 */
export const ALLOWED_PAGE_NOISE: RegExp[] = [
  // The browser auto-requests /favicon.ico; we ship no icon at that path in the
  // test build, so the fetch fails harmlessly.
  /favicon\.ico/,
  // A client-cancelled request, never a server/JS regression: e.g. the
  // switch-to-maintenance DELETE is issued from the reached-Goal banner, which
  // unmounts the instant the switch succeeds, so the browser abandons the
  // in-flight fetch (the route still resolved and the page transitioned). Other
  // `requestfailed` reasons (connection refused, DNS, timeout) stay strict.
  /net::ERR_ABORTED/,
]

/**
 * Extra noise tolerated only in the **mocked** e2e suite (`pnpm test:e2e`).
 *
 * That suite stubs `/api/*` per-test with `page.route`, mocking only the
 * endpoints a given test asserts on; any other call reaches the backend-less
 * preview server and comes back `502`, which the browser logs as a resource
 * load error. Tests that deliberately exercise failure paths (e.g. the error
 * toast) add their own failed-load lines too. None of that is a regression in
 * the mocked suite, so we tolerate the browser's generic failed-load message
 * here — while still failing on uncaught exceptions and app-level console
 * errors. The real-stack smokes use only [ALLOWED_PAGE_NOISE], so a genuinely
 * failed request there still fails the test.
 */
export const MOCKED_E2E_NOISE: RegExp[] = [/Failed to load resource/]

/**
 * Extra noise tolerated only in the real-stack **smoke** suite (`pnpm test:smoke`).
 *
 * Tucker's reads are probe-and-handle-404 by design: `GET /api/profile`,
 * `/api/goal`, `/api/goal/progress`, `/api/weight/latest`, and `/api/weekly-review`
 * each return **404** in their empty / Maintenance-Mode state, which the SPA
 * handles gracefully (the setup nudge, the Maintaining card, an empty list). The
 * browser still logs each as a failed resource load, so a fresh-slate smoke (every
 * test resets the DB, #70) is full of expected 404s. We tolerate the 404 probe
 * here while keeping 5xx, connection failures, uncaught exceptions, and app-level
 * console errors strict.
 */
export const SMOKE_NOISE: RegExp[] = [
  /Failed to load resource: the server responded with a status of 404/,
]

/**
 * Watch [page] for the silent classes of regression the suites never asserted on
 * before (issue #85): uncaught exceptions (`pageerror`), `console.error` output,
 * and failed network requests (`requestfailed`). Returns a getter for the
 * unexpected problems collected so far — anything not matched by
 * [ALLOWED_PAGE_NOISE] or the suite-specific [extraAllowed] patterns. The shared
 * fixtures assert it stays empty at teardown.
 */
export function watchPageErrors(
  page: Page,
  extraAllowed: RegExp[] = [],
): () => string[] {
  const problems: string[] = []
  const allowed = (text: string) =>
    [...ALLOWED_PAGE_NOISE, ...extraAllowed].some((pattern) =>
      pattern.test(text),
    )

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !allowed(msg.text())) {
      problems.push(`console.error: ${msg.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    if (!allowed(error.message)) {
      problems.push(`pageerror: ${error.message}`)
    }
  })
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? ''
    if (!allowed(request.url()) && !allowed(failure)) {
      problems.push(
        `requestfailed: ${request.method()} ${request.url()} — ${failure}`,
      )
    }
  })

  return () => problems
}

/**
 * The shared body of each suite's auto error-guard fixture: watch the page for
 * the run, then fail with the collected problems if any survived the allowlist.
 * Both the mocked and smoke fixtures call this so the failure semantics live in
 * one place; they differ only in the [allowed] noise they pass.
 */
export async function assertNoPageErrors(
  page: Page,
  use: () => Promise<void>,
  allowed: RegExp[],
): Promise<void> {
  const problems = watchPageErrors(page, allowed)
  await use()
  expect(
    problems(),
    `Unexpected page errors:\n${problems().join('\n')}`,
  ).toEqual([])
}
