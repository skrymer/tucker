# The labelled Playwright fallback

When claude-in-chrome stops landing clicks or keystrokes, or the window will not reach
phone width, drive the same dev server and the same data from a throwaway Playwright
spec. Label every probe it settles in the verdict as `(Playwright fallback)`.

What worked in #434's gate 6, after three failed setups:

1. Put the spec and its own config under `frontend/.stryker-tmp/`, which nothing gates
   and git ignores. `--config=/dev/null` finds no tests; the committed config builds and
   serves its own app instead of using your dev server.

   ```ts
   // frontend/.stryker-tmp/pw.config.ts
   import { defineConfig } from '@playwright/test'
   export default defineConfig({ testDir: '.', testMatch: 'verify-<n>.spec.ts' })
   ```

2. Point the spec at **your** dev server (see the port rule in SKILL.md), and take
   Pixel 7 without its `defaultBrowserType`: `test.use(devices['Pixel 7'])` inside a
   `describe` fails with "Cannot use({ defaultBrowserType }) in a describe group".

   ```ts
   import { expect, test, devices } from '@playwright/test'

   test.use({ baseURL: 'http://localhost:3001' })

   test('desktop: …', async ({ page }) => {
     await page.goto('/foods')
     // drive by role and name; type with pressSequentially, not fill
   })

   test.describe('phone (Pixel 7)', () => {
     const { defaultBrowserType: _browser, ...pixel7 } = devices['Pixel 7']
     test.use(pixel7)
     test('…', async ({ page }) => { /* … */ })
   })
   ```

3. Run it from `frontend/`, then delete both files:

   ```bash
   node_modules/.bin/playwright test --config=.stryker-tmp/pw.config.ts --reporter=line
   ```

Locate by what the page renders, not by what was typed: a Food saved as "périgord" is
listed sentence-cased, and a name locator built from the input missed it.
