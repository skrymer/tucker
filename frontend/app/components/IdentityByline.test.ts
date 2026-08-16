import { describe, expect, it } from 'vitest'
import { renderSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import IdentityByline from './IdentityByline.vue'

describe('IdentityByline', () => {
  it('names the person whose data is on screen', async () => {
    registerEndpoint('/api/me', () => ({ email: 'tester@tucker.invalid' }))

    await renderSuspended(IdentityByline)

    expect(
      await screen.findByText(/signed in as tester@tucker\.invalid/i),
    ).toBeVisible()
  })

  it('sends Sign out through a real navigation, not the SPA router', async () => {
    // Access owns the session, so ending it is Cloudflare's path at the edge,
    // not one Tucker serves. It has to leave the SPA to get there: a router
    // `to` would resolve against the precached shell (ADR 0011) and quietly
    // re-render Tucker as the same signed-in person.
    registerEndpoint('/api/me', () => ({ email: 'tester@tucker.invalid' }))

    await renderSuspended(IdentityByline)

    expect(screen.getByRole('link', { name: 'Sign out' })).toHaveAttribute(
      'href',
      '/cdn-cgi/access/logout',
    )
  })

  it('keeps the way out when it cannot say who you are', async () => {
    // Sign out is a static link and needs no backend, so a failed read costs
    // the name and nothing else — the half that still works stays, rather than
    // the line vanishing exactly when you might most want out of it. Naming
    // nobody beats naming them wrongly, so the phrase goes with the address.
    registerEndpoint('/api/me', () => {
      throw new Error('backend unreachable')
    })

    await renderSuspended(IdentityByline)

    expect(screen.getByRole('link', { name: 'Sign out' })).toBeVisible()
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument()
  })
})
