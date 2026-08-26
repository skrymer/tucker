import { beforeEach, describe, expect, it, vi } from 'vitest'
import plugin from './csrf.client'
import { CSRF_COOKIE, CSRF_HEADER } from '~/utils/csrf'

// The one plugin in this app with a test of its own. Its sibling `auth-gate`
// leaves the hook wiring cross-file-traced, which is the right call for glue —
// but this hook *is* the CSRF defence (ADR 0025), and every branch of it decides
// whether a mutation is provable. The real-stack `csrf` smoke covers the two
// paths a browser takes; these cover the ones it cannot reach cheaply, and are
// what the mutation gate can see at all.

/** Install the plugin against a stand-in nuxtApp and hand back the hook it registered. */
function installedHook() {
  let registered:
    | ((ctx: { options: Record<string, unknown> }) => void)
    | undefined
  const nuxtApp = {
    hooks: {
      hook: (name: string, fn: typeof registered) => {
        if (name === 'openFetch:onRequest:api') registered = fn
      },
    },
  }
  ;(plugin as unknown as (app: typeof nuxtApp) => void)(nuxtApp)
  if (!registered)
    throw new Error('plugin registered no openFetch:onRequest:api hook')
  return registered
}

function handOutToken(value: string) {
  document.cookie = `${CSRF_COOKIE}=${value}`
}

describe('csrf plugin', () => {
  beforeEach(() => {
    document.cookie = `${CSRF_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  })

  it('sends the token Tucker handed out on a mutation', () => {
    handOutToken('token-abc')
    const options: Record<string, unknown> = { method: 'POST' }

    installedHook()({ options })

    expect(new Headers(options.headers as HeadersInit).get(CSRF_HEADER)).toBe(
      'token-abc',
    )
  })

  // Spring's own safe set, pinned one method at a time. A copied list is exactly
  // the thing that rots silently: drop a method from it and requests merely gain a
  // harmless header, but *add* one — 'POST' — and the defence is gone with every
  // suite still green.
  it.each(['GET', 'HEAD', 'TRACE', 'OPTIONS'])(
    'sends nothing on %s, which changes nothing and needs no proof',
    (method) => {
      handOutToken('token-abc')
      const options: Record<string, unknown> = { method }

      installedHook()({ options })

      expect(options.headers).toBeUndefined()
    },
  )

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'proves a %s, which changes state',
    (method) => {
      handOutToken('token-abc')
      const options: Record<string, unknown> = { method }

      installedHook()({ options })

      expect(new Headers(options.headers as HeadersInit).get(CSRF_HEADER)).toBe(
        'token-abc',
      )
    },
  )

  it('treats a lower-case method as the same method', () => {
    handOutToken('token-abc')
    const options: Record<string, unknown> = { method: 'post' }

    installedHook()({ options })

    expect(new Headers(options.headers as HeadersInit).get(CSRF_HEADER)).toBe(
      'token-abc',
    )
  })

  it('treats a request that names no method as the GET it will be', () => {
    handOutToken('token-abc')
    const options: Record<string, unknown> = {}

    installedHook()({ options })

    expect(options.headers).toBeUndefined()
  })

  it('says so, and sends nothing, when Tucker has handed out no token', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const options: Record<string, unknown> = { method: 'DELETE' }

    installedHook()({ options })

    expect(options.headers).toBeUndefined()
    // Named loudly: every mutation failing at once would otherwise present as
    // "check your connection" with nothing said anywhere.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DELETE'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no CSRF token'))
    warn.mockRestore()
  })

  it('keeps the headers the caller already set', () => {
    handOutToken('token-abc')
    const options: Record<string, unknown> = {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
    }

    installedHook()({ options })

    const sent = new Headers(options.headers as HeadersInit)
    expect(sent.get('content-type')).toBe('application/json')
    expect(sent.get(CSRF_HEADER)).toBe('token-abc')
  })
})
