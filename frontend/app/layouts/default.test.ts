import { beforeEach, describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import { useAuthGate } from '~/composables/useAuthGate'
import { http } from '~~/test/mocks/http'
import { server, useMswServer } from '~~/test/mocks/node'
import { profileOf, weightOnlyProfile } from '~~/test/mocks/handlers/profile'
import DefaultLayout from './default.vue'

useMswServer()

// Driven through the real composable rather than a mock: it is one shared ref
// and a setter, so a mock could only be a second copy of that. Its state is
// app-wide, so every test states its own.
beforeEach(() => {
  useAuthGate().isSignedOut.value = false
})

/**
 * Stands in for the auth-gate plugin: `/api/profile` is the read `AppNav`
 * suspends on, so the flag flips while the layout is still rendering. The read
 * itself falls through to the baseline.
 */
const sessionEndsDuringTheProfileRead = () =>
  http.get('/api/profile', () => {
    useAuthGate().markSignedOut()
    return undefined
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
    server.use(sessionEndsDuringTheProfileRead())

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
    server.use(profileOf(weightOnlyProfile))

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
