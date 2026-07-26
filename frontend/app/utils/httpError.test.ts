import { describe, expect, it } from 'vitest'
import { isNotFound, statusOf } from './httpError'

describe('statusOf', () => {
  it('reads the status a server answered with', () => {
    expect(statusOf({ status: 503 })).toBe(503)
  })

  it('reports no status when nothing answered', () => {
    // A network failure carries no status, and that absence is the signal: the
    // request never reached anything that could hold a verdict (issue #164).
    expect(statusOf(new TypeError('Failed to fetch'))).toBeUndefined()
  })

  it('survives a thrown value that is not an object', () => {
    expect(statusOf(null)).toBeUndefined()
    expect(statusOf(undefined)).toBeUndefined()
    expect(statusOf('boom')).toBeUndefined()
  })
})

describe('isNotFound', () => {
  it('recognises the one status that means the thing genuinely is not there', () => {
    expect(isNotFound({ status: 404 })).toBe(true)
  })

  it('does not mistake an unreachable server for a missing resource', () => {
    expect(isNotFound({ status: 503 })).toBe(false)
    expect(isNotFound(new TypeError('Failed to fetch'))).toBe(false)
  })
})
