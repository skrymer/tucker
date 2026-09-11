import { describe, expect, it } from 'vitest'
import { INSTALL_OFFER_EVENT, INSTALLED_EVENT } from './installEvents'

describe('installEvents', () => {
  // These are the browser's names, not Tucker's choices, and every other layer
  // reads them from here — the capture, the Vitest fake and the Playwright one.
  // That is what makes them worth asserting as literals: a wrong name leaves all
  // three agreeing with each other and disagreeing only with the browser, so the
  // suites stay green while the Install button never appears on any real device.
  it('listens for the names Chromium actually fires', () => {
    expect(INSTALL_OFFER_EVENT).toBe('beforeinstallprompt')
    expect(INSTALLED_EVENT).toBe('appinstalled')
  })
})
