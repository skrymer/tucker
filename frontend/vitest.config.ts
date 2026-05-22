import { defineVitestConfig } from '@nuxt/test-utils/config'

// Component / unit tests. Browser end-to-end tests live in e2e/ and run under
// Playwright (see playwright.config.ts).
export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['app/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})
