import { describe, expect, it } from 'vitest'
import { readCsrfToken } from './csrf'

describe('readCsrfToken', () => {
  it('reads the token from among the other cookies on the document', () => {
    expect(readCsrfToken('foo=1; XSRF-TOKEN=abc123; bar=2')).toBe('abc123')
  })

  it('reads it when it is the only cookie, with no leading space', () => {
    expect(readCsrfToken('XSRF-TOKEN=abc123')).toBe('abc123')
  })

  it('has none before Tucker has handed one out', () => {
    expect(readCsrfToken('')).toBeNull()
    expect(readCsrfToken('foo=1; bar=2')).toBeNull()
  })

  // A name-suffix match would read someone else's cookie as the token and send
  // it, which fails every mutation with a 403 that looks like a server fault.
  it('does not mistake a cookie whose name merely ends with the token name', () => {
    expect(readCsrfToken('MY-XSRF-TOKEN=nope')).toBeNull()
  })
})
