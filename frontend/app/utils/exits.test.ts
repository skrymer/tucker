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
})
