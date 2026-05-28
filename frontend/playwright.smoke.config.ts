import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'

// Real-stack smoke tests. The backend runs in Docker (via the repo-root
// docker-compose.yml); the SPA proxies /api/* to it through Nuxt routeRules.
// No /api/* mocks here — these tests prove the wired UI → API → DB stack.
//
// Tests must clean up data they create (the docker volume persists between
// runs); writes that aren't cleaned will leak into the next run.
//
// Run with `pnpm test:smoke`. The webServer rebuilds the backend image
// on every run (`up --build`) so a stale image from earlier work can't
// silently mask backend changes. One-time setup:
// `pnpm exec playwright install chromium`.
export default defineConfig<ConfigOptions>({
  testDir: './e2e/smoke',
  fullyParallel: false, // shared DB → serial
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-smoke-report' }],
  ],
  use: {
    nuxt: {
      rootDir: fileURLToPath(new URL('.', import.meta.url)),
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Run every smoke at both viewports — phone-only branches (UDrawer,
  // FAB-as-trigger) only get real-stack coverage this way.
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'docker compose up --build backend',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    // Springdoc serves the OpenAPI doc once Spring Boot is fully up — good
    // readiness signal.
    url: 'http://localhost:8080/v3/api-docs',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
