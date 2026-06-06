import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { usePwaInstall } from './usePwaInstall'
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

  it('shows the browser install prompt and consumes it so it cannot be reused', async () => {
    await renderSuspended(Harness)
    const event = fakeInstallEvent()
    window.dispatchEvent(event)
    await nextTick()

    await userEvent.click(screen.getByRole('button', { name: 'install' }))

    expect(event.prompt).toHaveBeenCalledOnce()
    expect(text('can-install')).toBe('false')
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

    window.dispatchEvent(new Event('appinstalled'))
    await nextTick()

    expect(text('installed')).toBe('true')
    expect(text('can-install')).toBe('false')
  })
})
