import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { settle } from '~~/test/async-gate'
import { failingRead, held } from '~~/test/mocks/http'
import { server, useMswServer } from '~~/test/mocks/node'
import IdentityByline from './IdentityByline.vue'

useMswServer()

describe('IdentityByline', () => {
  it('names the person whose data is on screen', async () => {
    await renderSuspended(IdentityByline)

    expect(
      await screen.findByText(/signed in as user@example\.com/i),
    ).toBeVisible()
  })

  it('sends Sign out through a real navigation, not the SPA router', async () => {
    // Access owns the session, so ending it is Cloudflare's path at the edge,
    // not one Tucker serves. It has to leave the SPA to get there: a router
    // `to` would resolve against the precached shell (ADR 0011) and quietly
    // re-render Tucker as the same signed-in person.
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
    const read = held('get', '/api/me')
    server.use(read.handler, failingRead('/api/me'))

    await renderSuspended(IdentityByline)
    await read.arrived
    read.release()
    // Long enough for the failure, and ofetch's own retry of it, to land.
    await settle()
    await settle()

    expect(screen.getByRole('link', { name: 'Sign out' })).toBeVisible()
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument()
  })
})
