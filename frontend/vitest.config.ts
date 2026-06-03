import { defineVitestConfig } from '@nuxt/test-utils/config'

// Component / unit tests. Browser end-to-end tests live in e2e/ and run under
// Playwright (see playwright.config.ts).
export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    setupFiles: ['./test/setup.ts'],
    include: ['app/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', 'e2e/**'],
    // Each test file boots its own Nuxt environment, which is CPU- and
    // IO-heavy. On a many-core machine the default (one worker per core)
    // boots them all at once, starving each `setupNuxt()` past the hook
    // timeout. Cap concurrency to halve the thrash, and give the setup
    // headroom for when it's still contended.
    maxWorkers: '50%',
    hookTimeout: 30000,
  },
})
