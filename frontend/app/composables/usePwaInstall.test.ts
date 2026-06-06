import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { usePwaInstall } from './usePwaInstall'

// The two true external boundaries here are the browser's install machinery —
// the `beforeinstallprompt`/`appinstalled` events the browser fires and the
// `matchMedia` + `userAgent` it reports — so the tests stub those and assert
// the composable's branching, never any internal collaborator (ADR 0013).

/** A fake browser `beforeinstallprompt` event, with the prompt() it carries. */
function fakeInstallEvent() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>
    userChoice: Promise<{ outcome: string }>
  }
  event.prompt = vi.fn(async () => {})
  event.userChoice = Promise.resolve({ outcome: 'accepted' })
  return event
}

function setUserAgent(ua: string, extras: Record<string, unknown> = {}) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
  for (const [key, value] of Object.entries(extras))
    Object.defineProperty(navigator, key, { value, configurable: true })
}

/** Stub matchMedia so the standalone-display query reports `installed`. */
function setStandalone(installed: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: installed && query.includes('standalone'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

const UA = {
  desktop:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}

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
