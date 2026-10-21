import { describe, expect, it, vi } from 'vitest'
import { createRouteChangeTimer } from './routeChangeTimer'

describe('timing a move between pages', () => {
  // ADR 0038: to the first paint after the new page mounts, not to the mount.
  it('stops the clock at the paint after the new page has mounted', () => {
    let clock = 0
    let paint = () => {}
    const record = vi.fn()
    const timer = createRouteChangeTimer({
      now: () => clock,
      afterPaint: (fn) => {
        paint = fn
      },
      record,
    })
    timer.finished('/today')

    clock = 1000
    timer.started()
    clock = 1300
    timer.finished('/foods')
    expect(record).not.toHaveBeenCalled()

    clock = 1316
    paint()
    expect(record).toHaveBeenCalledExactlyOnceWith('/foods', 316)
  })

  // A redirect while the visit opens is a second navigation before any page has
  // finished: still the page load, not a move.
  it('times nothing until the page a visit opened on has finished', () => {
    const record = vi.fn()
    const timer = createRouteChangeTimer({
      now: () => 0,
      afterPaint: (fn) => fn(),
      record,
    })

    timer.started()
    timer.started()
    timer.finished('/')

    expect(record).not.toHaveBeenCalled()
  })
})
