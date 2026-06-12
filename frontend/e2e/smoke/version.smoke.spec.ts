import { test, expect } from './support/smoke-test'

// Slice 4 smoke (issue #117): the build stamp against the real stack. Proves the
// Profile footer renders the running build (a semver + git SHA baked into the
// bundle) and that GET /api/version answers through the SPA's same-origin /api
// proxy. The exact values aren't asserted — they degrade to dev/unknown for a
// build that passes no args (local) and carry a real backend SHA in CI — so the
// test checks the stable shape. The precise match/split rendering is unit-tested
// in buildTag.test.ts and BuildTag.test.ts.

test('shows the running build on Profile and serves GET /api/version', async ({
  page,
  goto,
}) => {
  await goto('/profile', { waitUntil: 'hydration' })

  // The footer build tag: `v<semver> (<sha…>)`, whatever the build baked.
  await expect(page.getByText(/^v\S+ \(.+\)$/)).toBeVisible()

  // The backend half, reached through the same-origin /api proxy the SPA uses.
  const origin = new URL(page.url()).origin
  const res = await page.request.get(`${origin}/api/version`)
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as {
    version: string
    gitSha: string
    builtAt: string
  }
  expect(body.version).toBeTruthy()
  expect(body.gitSha).toBeTruthy()
  expect(body.builtAt).toBeTruthy()
})
