import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import { useAuthGate } from '~/composables/useAuthGate'
import DefaultLayout from './default.vue'

// Driven through the real composable rather than a mock: it is one shared ref
// and a setter, so a mock could only be a second copy of that. Its state is
// app-wide, so every test states its own.
let sessionEndsDuringTheProfileRead = false

beforeEach(() => {
  useAuthGate().isSignedOut.value = false
  sessionEndsDuringTheProfileRead = false
})

// Stands in for the auth-gate plugin: `/api/profile` is the read `AppNav`
// suspends on, so the flag flips while the layout is still rendering.
registerEndpoint('/api/profile', () => {
  if (sessionEndsDuringTheProfileRead) useAuthGate().markSignedOut()
  return {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
    tracksCalories: false,
  }
})

describe('default layout', () => {
  it('shows the signed-out interstitial instead of the page once the session has expired', async () => {
    useAuthGate().markSignedOut()

    await renderSuspended(DefaultLayout, {
      slots: { default: () => 'Page content' },
    })

    expect(
      screen.getByRole('heading', { name: "You've been signed out" }),
    ).toBeVisible()
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
  })

  it('shows the signed-out interstitial when the session ends while the shell is still loading', async () => {
    sessionEndsDuringTheProfileRead = true

    await renderSuspended(DefaultLayout, {
      slots: { default: () => 'Page content' },
    })

    expect(
      screen.getByRole('heading', { name: "You've been signed out" }),
    ).toBeVisible()
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
  })

  it('shows the signed-out interstitial when the session ends with the app already open', async () => {
    await renderSuspended(DefaultLayout, {
      slots: { default: () => 'Page content' },
    })
    expect(screen.getByText('Page content')).toBeVisible()

    useAuthGate().markSignedOut()

    expect(
      await screen.findByRole('heading', { name: "You've been signed out" }),
    ).toBeVisible()
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
  })

  it('renders the page content while the session is active', async () => {
    await renderSuspended(DefaultLayout, {
      slots: { default: () => 'Page content' },
    })

    expect(screen.getByText('Page content')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: "You've been signed out" }),
    ).not.toBeInTheDocument()
  })

  it('shapes the navigation to the signed-in User’s Profile', async () => {
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
