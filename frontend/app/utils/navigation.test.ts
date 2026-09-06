import { describe, expect, it } from 'vitest'
import { isDestinationActive, visibleDestinations } from './navigation'

// The destinations' icon names are deliberately unasserted. They are lookup
// data: a test naming 'i-lucide-house' pins the token a designer is entitled to
// change, not a rule. That every destination has one is enforced by the
// NavDestination type, and that they render is covered by the app-shell
// component tests. Mutation testing reports all six as survivors for this
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

describe('visibleDestinations', () => {
  it('carries Today, Log and Review in the tab bar', () => {
    expect(visibleDestinations(true).primary.map((d) => d.label)).toEqual([
      'Today',
      'Log',
      'Review',
    ])
  })

  it('puts Foods, Check and Profile behind More', () => {
    expect(visibleDestinations(true).overflow.map((d) => d.label)).toEqual([
      'Foods',
      'Check',
      'Profile',
    ])
  })

  it('drops Log, Foods and Check when the User is not counting calories', () => {
    const { primary, overflow } = visibleDestinations(false)

    expect(primary.map((d) => d.label)).toEqual(['Today', 'Review'])
    // Profile stays behind More rather than being promoted into the bar: the
    // alternative makes one setting both remove Log and move a destination the
    // User had learned the position of (ADR 0028).
    expect(overflow.map((d) => d.label)).toEqual(['Profile'])
  })
})
