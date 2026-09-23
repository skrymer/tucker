import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'
import { MOCKED_E2E_TIMEZONE } from './e2e/support/date'

// Browser end-to-end tests with the backend API mocked via `page.route`
// (see e2e/support/mock-api.ts). Fast, deterministic, no external services.
// For real-stack smoke tests against the Docker backend see
// playwright.smoke.config.ts.
//
// The app is built once (scripts/build-e2e.mjs) and served by `webServer`, and
// every worker reaches that one server through `nuxt.host`, which switches off
// @nuxt/test-utils' own per-worker build. Its `goto` fixture waits for
// hydration in the page, whoever started the server.
//
// A free port rather than a fixed one, so two checkouts can run the suite at
// once. The config is evaluated again in every worker, and a worker inherits
// the environment the main process set here, so they all read the same port.
process.env.TUCKER_E2E_PORT ??= String(await freePort())
const origin = `http://127.0.0.1:${process.env.TUCKER_E2E_PORT}`

export default defineConfig<ConfigOptions>({
  testDir: './e2e',
  testIgnore: 'smoke/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Locally capped at 4. The app is built once, before any browser starts, so
  // peak memory is the build's own ~2.7 GB and barely moves with workers.
  // Measured on a 14-core / 30 GB host inside scripts/bounded-run.sh, full suite:
  //   workers  wall    peak memory  CPU     (before: a build per worker)
  //   7        54 s    3.5 GB       406 s   (OOM-killed past 14 GB after 22 s)
  //   4        63 s    2.8 GB       375 s   (101 s  11.5 GB  823 s)
  //   2        82 s    2.7 GB       313 s   (114 s   6.0 GB  489 s)
  //   1        123 s   2.7 GB       259 s   (158 s   3.2 GB  335 s)
  // Past 4 the extra workers buy 9 s of CPU the host shares with the backend
  // and mutation suites. CI runs 2: a worker costs a browser, not a build.
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Per-project snapshot files so Desktop Chrome and Mobile Chrome get
  // their own baselines (the responsive layouts differ — e.g. Add-food
  // header button vs floating action button on /foods).
  snapshotPathTemplate:
    '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}',
  webServer: {
    // Two processes, so the build's tooling is gone before the tests start.
    command:
      'node scripts/build-e2e.mjs && node .nuxt/e2e/output/server/index.mjs',
    url: origin,
    env: {
      HOST: '127.0.0.1',
      PORT: process.env.TUCKER_E2E_PORT,
      NODE_ENV: 'production',
    },
    timeout: 300_000,
  },
  use: {
    nuxt: {
      host: origin,
      // Not built from with `host` set, but test-utils still resolves it, and
      // falls back to the cwd, which is not the app when run from the repo root.
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

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => resolve(port))
    })
  })
}
