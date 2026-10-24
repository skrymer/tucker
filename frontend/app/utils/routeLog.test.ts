import { describe, expect, it } from 'vitest'
import { createRouteLog } from './routeLog'

describe('which route was showing at a moment', () => {
  it('names the route entered last before the moment', () => {
    const log = createRouteLog()
    log.entered('/today', 0)
    log.entered('/foods', 1_000)
    log.entered('/review', 5_000)

    expect(log.routeAt(4_999)).toBe('/foods')
  })

  it('names the route entered at the very moment', () => {
    const log = createRouteLog()
    log.entered('/today', 0)
    log.entered('/foods', 1_000)

    expect(log.routeAt(1_000)).toBe('/foods')
  })

  // A tap no route was showing for is put on none rather than guessed at.
  it('names no route for a moment before any was entered', () => {
    const log = createRouteLog()
    log.entered('/today', 200)

    expect(log.routeAt(199)).toBeUndefined()
  })
})
