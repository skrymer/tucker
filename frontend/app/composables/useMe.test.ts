import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { forgetAppState } from '~~/test/app-state'
import { openGate, settle } from '~~/test/async-gate'
import { baselineEmail, signedInAsAdmin } from '~~/test/mocks/handlers/identity'
import { http, serverError } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { useMe } from './useMe'

/** Joins the read, then says whether the caller is an Admin. */
const host = defineComponent({
  async setup() {
    const { isAdmin, ready } = useMe()
    await ready()
    return { isAdmin }
  },
  template: `<span>admin: {{ isAdmin }}</span>`,
})

beforeEach(() => forgetAppState())

describe('useMe', () => {
  it('tells an Admin that they are one', async () => {
    server.use(signedInAsAdmin)
    await renderSuspended(host)

    expect(screen.getByText('admin: true')).toBeVisible()
  })

  it('names the address the caller is signed in as', async () => {
    await renderSuspended(
      defineComponent({
        async setup() {
          const { email, ready } = useMe()
          await ready()
          return { email }
        },
        template: `<span>{{ email }}</span>`,
      }),
    )

    expect(screen.getByText(baselineEmail)).toBeVisible()
  })

  // The number of reads is the behaviour here (ADR 0007's exception), so the
  // answer changes after the first.
  it('answers every later caller from the first read', async () => {
    let answered = false
    server.use(
      http.get('/api/me', ({ response }) => {
        const admin = !answered
        answered = true
        return response(200).json({ email: baselineEmail, admin })
      }),
    )
    await renderSuspended(host)

    await renderSuspended(host)

    expect(screen.getByText('admin: true')).toBeVisible()
  })

  it('joins a read already in flight rather than asking again', async () => {
    // A second request is never answered, so a caller that asks again instead
    // of joining is still waiting when the first read has long landed.
    const { gate, release } = openGate()
    let asked = false
    server.use(
      http.get('/api/me', async ({ response }) => {
        if (asked) return new Promise<never>(() => {})
        asked = true
        await gate
        return response(200).json({ email: baselineEmail, admin: true })
      }),
    )
    const rendered = renderSuspended(
      defineComponent({
        async setup() {
          const { ready } = useMe()
          await Promise.all([ready(), ready()])
          return {}
        },
        template: `<span>both answered</span>`,
      }),
    ).then(() => 'answered')

    release()
    const first = await Promise.race([rendered, settle().then(() => 'waiting')])

    expect(first).toBe('answered')
  })

  it('logs a failed read, draws no Admin, and lets the next caller ask again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Only the first call fails, and that is the point (ADR 0007's exception): a
    // retry of the failed read would reach the answer and show an Admin.
    let failed = false
    server.use(
      http.get('/api/me', ({ response }) => {
        if (failed)
          return response(200).json({ email: baselineEmail, admin: true })
        failed = true
        return response.untyped(serverError())
      }),
    )

    await renderSuspended(host)
    expect(screen.getByText('admin: false')).toBeVisible()
    expect(warn).toHaveBeenCalledWith(
      'Could not read who is signed in',
      expect.anything(),
    )

    await renderSuspended(host)
    expect(screen.getByText('admin: true')).toBeVisible()
    warn.mockRestore()
  })
})
