import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import InstallPrompt from './InstallPrompt.vue'
import {
  fakeInstallEvent,
  setStandalone,
  setUserAgent,
  UA,
} from '../../test/pwa-install-helpers'

// InstallPrompt composes the real usePwaInstall (ADR 0013: no internal mocks);
// the tests drive it through the true browser boundary it reacts to — the
// install event, matchMedia, and userAgent.

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
