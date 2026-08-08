import { test, expect } from './support/smoke-test'

// Slice 6 smoke (issue #160): "Signed in as…" against the real stack.
//
// The mocked suite stubs `/api/me`, so it would go on passing if the endpoint
// 401'd, 404'd, or answered the same address to everyone. This is the half that
// can't: a real gated backend, reached through the SPA's same-origin `/api`
// proxy, with the assertion attached exactly the way production attaches it.
//
// What it deliberately does *not* cover is Sign out actually ending the session.
// `/cdn-cgi/access/logout` is served by Cloudflare's edge, so it exists only on
// the deployed origin and 404s here — the specs assert the destination, and the
// outcome is verifiable on the real origin alone.

test('names the signed-in User on Profile, through the real gate', async ({
  page,
  goto,
}) => {
  await goto('/profile', { waitUntil: 'hydration' })

  await expect(
    page.getByText('Signed in as tester@tucker.invalid'),
  ).toBeVisible()

  await expect(page.getByRole('link', { name: 'Sign out' })).toHaveAttribute(
    'href',
    '/cdn-cgi/access/logout',
  )
})

test('answers each caller with their own address', async ({
  page,
  goto,
  request,
  otherUser,
}) => {
  // The identity line's whole job is saying *whose* data is on screen, so an
  // endpoint that answered one address to every caller would be worse than
  // absent. Two real assertions, verified by the backend's own decoder.
  //
  // Navigating first is what makes `origin` the SPA's own, so both calls go
  // through the same-origin `/api` proxy rather than straight to the container.
  await goto('/', { waitUntil: 'hydration' })
  const origin = new URL(page.url()).origin

  const mine = await request.get(`${origin}/api/me`)
  expect(mine.ok()).toBe(true)
  expect(await mine.json()).toEqual({ email: 'tester@tucker.invalid' })

  const theirs = await otherUser.get(`${origin}/api/me`)
  expect(theirs.ok()).toBe(true)
  expect(await theirs.json()).toEqual({ email: 'someone.else@tucker.invalid' })
})
