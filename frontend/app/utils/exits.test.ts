import { describe, expect, it } from 'vitest'
import { NETWORK_ONLY_PREFIXES, SIGN_IN_PATH, SIGN_OUT_PATH } from './exits'

describe('exits', () => {
  // The failure this guards is invisible: drop a prefix and nothing errors —
  // the service worker just answers the exit from the precached shell, so the
  // link re-renders Tucker instead of leaving it. No component test can see
  // that, because they all assert the href, which stays correct.
  it.each([
    ['sign out', SIGN_OUT_PATH],
    ['sign back in', SIGN_IN_PATH],
  ])('keeps %s reachable by the network, not the cache', (_name, path) =>
    expectNetworkOnly(path),
  )

  // Workbox matches these against the path *and* the query (`NavigationRoute`
  // tests `url.pathname + url.search`), so an entry naming a single route has
  // to admit one — Access is free to hand a User back with a message parameter,
  // as it already does on the way out.
  it('keeps the sign-in exit network-only when it carries a query', () =>
    expectNetworkOnly(`${SIGN_IN_PATH}?__cf_access_message=logged_out`))

  // The entries are anchored, so they are prefixes rather than substrings. An
  // unanchored one also matches an ordinary in-app route that happens to
  // contain it, which drops that route out of the navigation fallback: offline,
  // it stops falling back to the precached shell and fails to open at all.
  it.each([
    ['/foods/api/apple'],
    ['/profile/cdn-cgi/trace'],
    ['/foods/sign-in'],
  ])('leaves %s to the cache — a prefix has to match at the start', (path) =>
    expectLeftToTheCache(path),
  )

  // [SIGN_IN_PATH] names one route rather than a namespace, so its entry stops
  // where nitro's does. Left open it also claims every route merely beginning
  // with those letters, and every sub-path nothing serves.
  it.each([['/sign-in-help'], ['/sign-in/help']])(
    'leaves %s to the cache — a route entry ends where the route does',
    (path) => expectLeftToTheCache(path),
  )
})

function expectNetworkOnly(path: string) {
  expect(
    NETWORK_ONLY_PREFIXES.some((prefix) => prefix.test(path)),
    `${path} is not covered by any NETWORK_ONLY_PREFIXES entry, so the ` +
      `service worker would serve the app shell for it instead of leaving ` +
      `the SPA`,
  ).toBe(true)
}

function expectLeftToTheCache(path: string) {
  expect(
    NETWORK_ONLY_PREFIXES.some((prefix) => prefix.test(path)),
    `${path} is an in-app route, but a NETWORK_ONLY_PREFIXES entry matched it ` +
      `— so the service worker would stop serving the app shell for it and ` +
      `the route would not open offline`,
  ).toBe(false)
}
