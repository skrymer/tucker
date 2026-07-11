import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { ref } from 'vue'
import DefaultLayout from './default.vue'

const state = vi.hoisted(() => ({ isLoggedOut: false }))
mockNuxtImport('useAuthGate', () => () => ({
  isLoggedOut: ref(state.isLoggedOut),
  markLoggedOut: () => {
    state.isLoggedOut = true
  },
}))

describe('default layout', () => {
  it('shows the logged-out interstitial instead of the page once the session has expired', async () => {
    state.isLoggedOut = true

    await renderSuspended(DefaultLayout, {
      slots: { default: () => 'Page content' },
    })

    expect(
      screen.getByRole('heading', { name: "You've been logged out" }),
    ).toBeVisible()
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
  })

  it('renders the page content while the session is active', async () => {
    state.isLoggedOut = false

    await renderSuspended(DefaultLayout, {
      slots: { default: () => 'Page content' },
    })

    expect(screen.getByText('Page content')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: "You've been logged out" }),
    ).not.toBeInTheDocument()
  })
})
