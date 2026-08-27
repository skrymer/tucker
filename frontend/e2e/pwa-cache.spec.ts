import { expect, test } from './support/test'
import { PWA_ENTRY_POINTS } from '../app/utils/pwaEntryPoints'

// The headers that let a deploy reach an installed app at all (ADR 0011, "How
// the shell is replaced"). Nothing else in the suite would notice these going
// missing: a stale-but-working app looks exactly like a current one.
//
// Iterating the same constant `nuxt.config.ts` builds its `routeRules` from is
// the point — a fifth entry point added there is asserted here without an edit.
// These tests open no page, so the suite's console guard observes nothing.

for (const path of PWA_ENTRY_POINTS) {
  test(`revalidates ${path} on every request`, async ({ page }) => {
    const response = await page.request.get(path)

    expect(response.ok()).toBe(true)
    expect(response.headers()['cache-control']).toBe('no-cache')
  })
}

test('keeps content-hashed assets immutable', async ({ page }) => {
  // Read the URL off the shell rather than pinning a hash that changes every
  // build.
  const shell = await page.request.get('/')
  const hashed = /\/_nuxt\/[\w.-]+\.js/.exec(await shell.text())?.[0] ?? ''
  expect(hashed, 'the shell references a content-hashed asset').not.toBe('')

  const asset = await page.request.get(hashed)

  // Nitro strips Cache-Control from a 404, so without this a mis-picked URL
  // would fail as a missing header rather than as the missing asset it is.
  expect(asset.ok()).toBe(true)
  expect(asset.headers()['cache-control']).toBe(
    'public, max-age=31536000, immutable',
  )
})
