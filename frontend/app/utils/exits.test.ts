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
  ])('keeps %s reachable by the network, not the cache', (_name, path) => {
    expect(
      NETWORK_ONLY_PREFIXES.some((prefix) => prefix.test(path)),
      `${path} is not covered by any NETWORK_ONLY_PREFIXES entry, so the ` +
        `service worker would serve the app shell for it instead of leaving ` +
        `the SPA`,
    ).toBe(true)
  })

  // The entries are anchored, so they are prefixes rather than substrings. An
  // unanchored one also matches an ordinary in-app route that happens to
  // contain it, which drops that route out of the navigation fallback: offline,
  // it stops falling back to the precached shell and fails to open at all.
  it.each([['/foods/api/apple'], ['/profile/cdn-cgi/trace']])(
    'leaves %s to the cache — a prefix has to match at the start',
    (path) => {
      expect(
        NETWORK_ONLY_PREFIXES.some((prefix) => prefix.test(path)),
        `${path} is an in-app route, but a NETWORK_ONLY_PREFIXES entry matched ` +
          `it mid-path — so the service worker would stop serving the app shell ` +
          `for it and the route would not open offline`,
      ).toBe(false)
    },
  )
})
