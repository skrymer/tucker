import { vi } from 'vitest'

// Shared browser-boundary stubs for the PWA install tests (usePwaInstall and
// InstallPrompt). These are the *true external boundary* the install code reacts
// to — the browser's install events, matchMedia, and userAgent (ADR 0013) — so
// both the composable test and the component test that composes it drive the
// same fakes rather than each redefining them.

/** A fake browser `beforeinstallprompt` event, carrying the prompt() it offers. */
export function fakeInstallEvent() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>
    userChoice: Promise<{ outcome: string }>
  }
  event.prompt = vi.fn(async () => {})
  event.userChoice = Promise.resolve({ outcome: 'accepted' })
  return event
}

/** Override navigator.userAgent (and any extra navigator props) for the test. */
export function setUserAgent(ua: string, extras: Record<string, unknown> = {}) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
  for (const [key, value] of Object.entries(extras))
    Object.defineProperty(navigator, key, { value, configurable: true })
}

/** Stub matchMedia so the standalone-display query reports `installed`. */
export function setStandalone(installed: boolean) {
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

export const UA = {
  desktop:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}
