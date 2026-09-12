import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { resetPwaInstallCapture, usePwaInstall } from './usePwaInstall'
import { INSTALLED_EVENT } from '../utils/installEvents'
import {
  fakeInstallEvent,
  setStandalone,
  setUserAgent,
  UA,
} from '../../test/pwa-install-helpers'

// The two true external boundaries here are the browser's install machinery —
// the `beforeinstallprompt`/`appinstalled` events the browser fires and the
// `matchMedia` + `userAgent` it reports — so the tests stub those and assert
// the composable's branching, never any internal collaborator (ADR 0013).

// Surface the composable's reactive state into the DOM and drive promptInstall()
// through a button — the way a consumer (InstallPrompt) would.
const Harness = defineComponent({
  setup() {
    return usePwaInstall()
  },
  template: `
    <div>
      <span data-testid="platform">{{ platform }}</span>
      <span data-testid="installed">{{ isInstalled }}</span>
      <span data-testid="can-install">{{ canInstall }}</span>
      <span data-testid="ios-hint">{{ iosInstructions }}</span>
      <button @click="promptInstall">install</button>
    </div>
  `,
})

const text = (id: string) => screen.getByTestId(id).textContent

beforeEach(() => {
  setUserAgent(UA.desktop, { maxTouchPoints: 0, standalone: undefined })
  setStandalone(false)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // The capture outlives every component by design, so an offer made here would
  // otherwise still be standing in the next test.
  resetPwaInstallCapture()
})

describe('usePwaInstall', () => {
  it('reports the desktop platform with nothing installable until the browser offers an install', async () => {
    await renderSuspended(Harness)

    expect(text('platform')).toBe('desktop')
    expect(text('can-install')).toBe('false')
    expect(text('installed')).toBe('false')
    expect(text('ios-hint')).toBe('false')
  })

  it('becomes installable once the browser fires beforeinstallprompt', async () => {
    await renderSuspended(Harness)
    expect(text('can-install')).toBe('false')

    window.dispatchEvent(fakeInstallEvent())
    await nextTick()

    expect(text('can-install')).toBe('true')
  })

  it('suppresses the browser mini-infobar so Tucker drives the install itself', async () => {
    await renderSuspended(Harness)
    const event = fakeInstallEvent()
    const preventDefault = vi.spyOn(event, 'preventDefault')

    window.dispatchEvent(event)
    await nextTick()

    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('shows the browser install prompt and consumes it so it cannot be reused', async () => {
    await renderSuspended(Harness)
    const event = fakeInstallEvent()
    window.dispatchEvent(event)
    await nextTick()

    await userEvent.click(screen.getByRole('button', { name: 'install' }))

    expect(event.prompt).toHaveBeenCalledOnce()
    expect(text('can-install')).toBe('false')
  })

  // Called directly rather than through the Harness: the button's handler is not
  // awaited, so a throw from it would surface as an unhandled rejection rather
  // than as a failure here.
  it('does nothing when asked to install with no offer in hand', async () => {
    const { promptInstall } = usePwaInstall()

    await expect(promptInstall()).resolves.toBeUndefined()
  })

  it('offers iOS Safari add-to-home-screen instructions, since it has no programmatic install', async () => {
    setUserAgent(UA.ios)
    await renderSuspended(Harness)

    expect(text('platform')).toBe('ios')
    expect(text('ios-hint')).toBe('true')
    expect(text('can-install')).toBe('false')
  })

  it('reports installed and shows no affordance when already running standalone', async () => {
    setUserAgent(UA.ios)
    setStandalone(true)
    await renderSuspended(Harness)

    expect(text('installed')).toBe('true')
    expect(text('ios-hint')).toBe('false')
    expect(text('can-install')).toBe('false')
  })

  it('reports installed on iOS, which reports it as navigator.standalone and nothing else', async () => {
    // matchMedia stays false: the display-mode query iOS Safari does not answer
    // is exactly what makes this flag the only signal there is (ADR 0011).
    setUserAgent(UA.ios, { standalone: true })
    setStandalone(false)
    await renderSuspended(Harness)

    expect(text('installed')).toBe('true')
    expect(text('ios-hint')).toBe('false')
  })

  it('reports not installed when the browser has no matchMedia to ask', async () => {
    vi.stubGlobal('matchMedia', undefined)
    await renderSuspended(Harness)

    expect(text('installed')).toBe('false')
  })

  it('detects the Android platform', async () => {
    setUserAgent(UA.android)
    await renderSuspended(Harness)

    expect(text('platform')).toBe('android')
    expect(text('ios-hint')).toBe('false')
  })

  it('flips to installed and drops the prompt when the app is installed mid-session', async () => {
    await renderSuspended(Harness)
    window.dispatchEvent(fakeInstallEvent())
    await nextTick()
    expect(text('can-install')).toBe('true')

    window.dispatchEvent(new Event(INSTALLED_EVENT))
    await nextTick()

    expect(text('installed')).toBe('true')
    expect(text('can-install')).toBe('false')
  })

  it('reports an install offer the browser made before the component mounted', async () => {
    // Nothing here starts the capture: app/plugins/pwa-install.client.ts does,
    // at app boot, which is the whole of the fix. The Nuxt test environment runs
    // the real plugin list, so this is what fails if that plugin goes.
    window.dispatchEvent(fakeInstallEvent())

    await renderSuspended(Harness)

    expect(
      text('can-install'),
      'nothing was listening — is app/plugins/pwa-install.client.ts still there?',
    ).toBe('true')
    expect(text('installed')).toBe('false')
  })

  it('keeps capturing after the consumer unmounts', async () => {
    const { unmount } = await renderSuspended(Harness)
    unmount()

    window.dispatchEvent(fakeInstallEvent())
    await renderSuspended(Harness)

    expect(text('can-install')).toBe('true')
  })
})
