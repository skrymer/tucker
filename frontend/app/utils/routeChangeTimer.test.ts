import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetPageStubs, setVisibility } from '~~/test/page-visibility-helpers'
import { createRouteChangeTimer } from './routeChangeTimer'

afterEach(() => resetPageStubs())

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
    expect(record).toHaveBeenCalledExactlyOnceWith('/foods', {
      valueMs: 316,
      start: 1000,
      end: 1316,
    })
  })

  // A hidden page paints nothing until it is shown again, so its clock would run on
  // through however long the User was away: that is not how long the page took.
  it('drops a move whose page was hidden before it painted', () => {
    let paint = () => {}
    const record = vi.fn()
    const timer = createRouteChangeTimer({
      now: () => 0,
      afterPaint: (fn) => {
        paint = fn
      },
      record,
    })
    timer.finished('/today')
    timer.started()
    timer.finished('/foods')

    setVisibility('hidden')
    paint()

    expect(record).not.toHaveBeenCalled()
  })

  it('keeps timing a move while the page is shown again', () => {
    const record = vi.fn()
    const timer = createRouteChangeTimer({
      now: () => 0,
      afterPaint: (fn) => fn(),
      record,
    })
    timer.finished('/today')
    timer.started()

    setVisibility('visible')
    timer.finished('/foods')

    expect(record).toHaveBeenCalledExactlyOnceWith('/foods', {
      valueMs: 0,
      start: 0,
      end: 0,
    })
  })

  it('drops a move that starts while the page is hidden', () => {
    const record = vi.fn()
    const timer = createRouteChangeTimer({
      now: () => 0,
      afterPaint: (fn) => fn(),
      record,
    })
    timer.finished('/today')
    setVisibility('hidden')

    timer.started()
    timer.finished('/foods')

    expect(record).not.toHaveBeenCalled()
  })

  it('drops a move whose page was hidden before it mounted', () => {
    const record = vi.fn()
    const timer = createRouteChangeTimer({
      now: () => 0,
      afterPaint: (fn) => fn(),
      record,
    })
    timer.finished('/today')
    timer.started()

    setVisibility('hidden')
    timer.finished('/foods')

    expect(record).not.toHaveBeenCalled()
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
