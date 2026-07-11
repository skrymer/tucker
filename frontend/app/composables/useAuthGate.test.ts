import { describe, expect, it } from 'vitest'
import { isAuthRedirectResponse, useAuthGate } from './useAuthGate'

describe('isAuthRedirectResponse', () => {
  it('recognizes an opaque redirect as an auth gate intercepting the request', () => {
    const opaqueRedirect = { type: 'opaqueredirect' }

    expect(isAuthRedirectResponse(opaqueRedirect)).toBe(true)
  })

  it('does not flag a normal successful response', () => {
    const ok = { type: 'basic' }

    expect(isAuthRedirectResponse(ok)).toBe(false)
  })

  it('does not flag a genuine app error, only an auth-gate redirect', () => {
    const notFound = { type: 'basic' }

    expect(isAuthRedirectResponse(notFound)).toBe(false)
  })
})

describe('useAuthGate', () => {
  it('shares markLoggedOut across every consumer, app-wide', () => {
    const { isLoggedOut } = useAuthGate()
    expect(isLoggedOut.value).toBe(false)

    const { markLoggedOut } = useAuthGate()
    markLoggedOut()

    expect(isLoggedOut.value).toBe(true)
  })
})
