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
  workers: process.env.CI ? 1 : undefined,
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
