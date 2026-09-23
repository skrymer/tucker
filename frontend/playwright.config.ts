import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'
import { MOCKED_E2E_TIMEZONE } from './e2e/support/date'

// Browser end-to-end tests with the backend API mocked via `page.route`
// (see e2e/support/mock-api.ts). Fast, deterministic, no external services.
// For real-stack smoke tests against the Docker backend see
// playwright.smoke.config.ts.
//
// @nuxt/test-utils builds and serves the Nuxt app; each test gets a `goto`
// fixture that waits for hydration.
export default defineConfig<ConfigOptions>({
  testDir: './e2e',
  testIgnore: 'smoke/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Locally capped at 2, because every worker is a whole Nuxt app: the `nuxt`
  // fixture is worker-scoped and runs its own production build and server, so
  // peak memory is ~2.8 GB per worker and does not grow with suite length.
  // Measured on a 14-core / 30 GB host inside scripts/bounded-run.sh, full suite:
  //   workers  wall    peak memory  CPU
  //   7        OOM-killed past 14 GB after 22 s, mid-build (Playwright's default)
  //   4        101 s   11.5 GB      823 s
  //   2        114 s    6.0 GB      489 s
  //   1        158 s    3.2 GB      335 s
  // Past 2 the extra builds buy 13 s for twice the memory. A worker restarts
  // (and so rebuilds) after a failure, but only in its own slot, so this also
  // caps the concurrent builds. CI's 1 is deliberate and stays.
  workers: process.env.CI ? 1 : 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Per-project snapshot files so Desktop Chrome and Mobile Chrome get
  // their own baselines (the responsive layouts differ — e.g. Add-food
  // header button vs floating action button on /foods).
  snapshotPathTemplate:
    '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}',
  use: {
    nuxt: {
      rootDir: fileURLToPath(new URL('.', import.meta.url)),
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Pinned so a spec reading a date the client stamped means the same thing
    // on a laptop and in CI; `e2e/support/date.ts` answers for the same zone.
    timezoneId: MOCKED_E2E_TIMEZONE,
  },
  // Two viewport projects so every spec runs on both — catches responsive
  // bugs (e.g. drawer-vs-modal branches, phone-only FAB layouts) that a
  // desktop-only run would miss.
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] } },
  ],
})
