import { describe, expect, it } from 'vitest'
import { isDestinationActive } from './navigation'

// navDestinations' icon names are deliberately unasserted. They are lookup
// data: a test naming 'i-lucide-house' pins the token a designer is entitled to
// change, not a rule. That every destination has one is enforced by the
// NavDestination type, and that they render is covered by the app-shell
// component tests. Mutation testing reports the five as survivors for this
// reason; that is the intended verdict, not a gap.

describe('isDestinationActive', () => {
  it('marks a destination active on its own route', () => {
    expect(isDestinationActive('/foods', '/foods')).toBe(true)
  })

  it('marks a destination active on one of its nested child routes', () => {
    expect(isDestinationActive('/profile', '/profile/weight')).toBe(true)
  })

  it('marks the Today root active at the root', () => {
    expect(isDestinationActive('/', '/')).toBe(true)
  })

  it('does not treat the Today root as active on every other route', () => {
    expect(isDestinationActive('/', '/profile')).toBe(false)
  })

  // The one thing the root's special case buys that the segment-boundary match
  // below it does not: for `to === '/'` that match reads `path.startsWith('//')`,
  // so a stray doubled slash — `tucker-diet.com//foods`, which the router hands
  // through as `//foods` — would light Today up alongside nothing else.
  it('does not mark the Today root active on a doubled-slash path', () => {
    expect(isDestinationActive('/', '//foods')).toBe(false)
  })

  it('matches on a path segment boundary, not a bare string prefix', () => {
    expect(isDestinationActive('/foods', '/foodstuff')).toBe(false)
  })
})
