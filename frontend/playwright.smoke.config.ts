import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'

// The smokes derive `today` from the runner's clock and the backend stamps
// Weekly Reviews on its own clock; both must agree on the calendar day. The
// `test:smoke` script sets TZ=Etc/UTC and docker-compose.smoke.yml pins the
// container to UTC — this fallback keeps a bare `playwright test --config …`
// invocation aligned too. (Authoritative source is the npm script.)
process.env.TZ ||= 'Etc/UTC'

// Real-stack smoke tests. The backend runs in Docker (via the repo-root
// docker-compose.yml + docker-compose.smoke.yml); the SPA proxies /api/* to it
// through the runtime nitro server route (server/routes/api/[...].ts), the same
// mechanism prod uses (ADR 0015). No /api/* mocks here — these tests prove the
// wired UI → API → DB stack, and are the regression proof for that proxy.
//
// Each run starts from a fresh, disposable database (issue #70): the smoke
// override writes SQLite to the container's writable layer and global setup
// `--force-recreate`s the backend, so Flyway re-migrates an empty DB every run
// and the clock-mocking smokes can't accumulate future-dated Weekly Reviews. A
// developer's manual `tucker-data` volume is never touched. Tests should still
// be self-contained (seed what they need), but inter-run data no longer leaks.
//
// Global setup also rebuilds the backend image on every run (`up --build`) so a
// stale image can't silently mask backend changes; see global-backend.setup.ts.
// Run with `pnpm test:smoke`. One-time setup:
// `pnpm exec playwright install chromium`.
export default defineConfig<ConfigOptions>({
  testDir: './e2e/smoke',
  // Boot/teardown the disposable backend ourselves (not via `webServer`): a
  // compose-managed container survives Playwright killing the attached CLI, so
  // an explicit `docker compose down` is the only reliable teardown.
  globalSetup: './e2e/smoke/global-backend.setup.ts',
  globalTeardown: './e2e/smoke/global-backend.teardown.ts',
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
})
