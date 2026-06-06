import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import InstallPrompt from './InstallPrompt.vue'

// InstallPrompt composes the real usePwaInstall (ADR 0013: no internal mocks);
// the tests drive it through the true browser boundary it reacts to — the
// install event, matchMedia, and userAgent.
function fakeInstallEvent() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>
    userChoice: Promise<{ outcome: string }>
  }
  event.prompt = vi.fn(async () => {})
  event.userChoice = Promise.resolve({ outcome: 'accepted' })
  return event
}

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
}

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
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}

beforeEach(() => {
  setUserAgent(UA.desktop)
  Object.defineProperty(navigator, 'standalone', {
    value: undefined,
    configurable: true,
  })
  setStandalone(false)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('InstallPrompt', () => {
  it('shows an install button on Chromium that triggers the browser install', async () => {
    await renderSuspended(InstallPrompt)
    const event = fakeInstallEvent()
    window.dispatchEvent(event)
    await nextTick()

    const button = screen.getByRole('button', { name: /install/i })
    await userEvent.click(button)

    expect(event.prompt).toHaveBeenCalledOnce()
  })

  it('shows Share / Add to Home Screen instructions on iOS instead of a button', async () => {
    setUserAgent(UA.ios)
    await renderSuspended(InstallPrompt)

    expect(screen.getByText(/add to home screen/i)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /install/i }),
    ).not.toBeInTheDocument()
  })

  it('renders no affordance once the app is already installed', async () => {
    setStandalone(true)
    await renderSuspended(InstallPrompt)

    expect(
      screen.queryByRole('button', { name: /install/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/add to home screen/i)).not.toBeInTheDocument()
  })
})
