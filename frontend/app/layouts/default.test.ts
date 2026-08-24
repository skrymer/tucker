import { describe, expect, it, vi } from 'vitest'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import { ref } from 'vue'
import DefaultLayout from './default.vue'

const state = vi.hoisted(() => ({ isSignedOut: false }))
mockNuxtImport('useAuthGate', () => () => ({
  isSignedOut: ref(state.isSignedOut),
  markSignedOut: () => {
    state.isSignedOut = true
  },
}))

registerEndpoint('/api/profile', () => ({
  sex: 'MALE',
  birthDate: '1990-06-15',
  heightCm: 180,
  tracksCalories: false,
}))

describe('default layout', () => {
  it('shows the signed-out interstitial instead of the page once the session has expired', async () => {
    state.isSignedOut = true

    await renderSuspended(DefaultLayout, {
      slots: { default: () => 'Page content' },
    })

    expect(
      screen.getByRole('heading', { name: "You've been signed out" }),
    ).toBeVisible()
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
  })

  it('renders the page content while the session is active', async () => {
    state.isSignedOut = false

    await renderSuspended(DefaultLayout, {
      slots: { default: () => 'Page content' },
    })

    expect(screen.getByText('Page content')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: "You've been signed out" }),
    ).not.toBeInTheDocument()
  })

  it('shapes the navigation to the signed-in User’s Profile', async () => {
    state.isSignedOut = false

    await renderSuspended(DefaultLayout, {
      slots: { default: () => 'Page content' },
    })

    for (const nav of screen.getAllByRole('navigation', { name: 'Primary' })) {
      expect(within(nav).queryByRole('link', { name: 'Foods' })).toBeNull()
      expect(within(nav).queryByRole('link', { name: 'Check' })).toBeNull()
      expect(within(nav).getByRole('link', { name: 'Today' })).toBeVisible()
    }
  })
})
