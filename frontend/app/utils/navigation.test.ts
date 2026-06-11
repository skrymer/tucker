import { describe, expect, it } from 'vitest'
import { isDestinationActive } from './navigation'

describe('isDestinationActive', () => {
  it('marks a destination active on one of its nested child routes', () => {
    expect(isDestinationActive('/profile', '/profile/weight')).toBe(true)
  })

  it('does not treat the Today root as active on every other route', () => {
    expect(isDestinationActive('/', '/profile')).toBe(false)
  })

  it('matches on a path segment boundary, not a bare string prefix', () => {
    expect(isDestinationActive('/foods', '/foodstuff')).toBe(false)
  })
})
