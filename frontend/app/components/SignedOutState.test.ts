import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import SignedOutState from './SignedOutState.vue'

describe('SignedOutState', () => {
  it('tells the user their session ended and how to fix it', async () => {
    await renderSuspended(SignedOutState)

    expect(
      screen.getByRole('heading', { name: "You've been signed out" }),
    ).toBeVisible()
    expect(screen.getByText('Sign back in to keep tracking.')).toBeVisible()
  })

  it('sends Sign back in through a real navigation, not the SPA router', async () => {
    // The installed PWA's service worker serves the cached shell for any
    // SPA-routed navigation (ADR 0011) — only a path outside its
    // navigateFallbackDenylist reaches the network, letting Cloudflare
    // Access's login challenge actually run. A router-driven `to` link
    // would just reopen the same stale, signed-out shell.
    await renderSuspended(SignedOutState)

    const link = screen.getByRole('link', { name: 'Sign back in' })

    expect(link).toHaveAttribute('href', '/api/version')
  })
})
