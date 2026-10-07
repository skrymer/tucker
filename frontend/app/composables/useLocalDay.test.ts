import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useLocalDay } from './useLocalDay'

afterEach(() => {
  vi.useRealTimers()
})

describe('useLocalDay', () => {
  it("starts on the user's local day", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 7, 21, 15))

    const day = effectScope().run(() => useLocalDay())!

    expect(day.value).toBe('2026-10-07')
  })
  it('turns over to the next day at local midnight while the page stays open', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59, 30))
    const day = effectScope().run(() => useLocalDay())!

    vi.advanceTimersByTime(29_000)
    expect(day.value).toBe('2026-10-07')

    vi.advanceTimersByTime(1_000)
    expect(day.value).toBe('2026-10-08')
  })
  it('keeps turning over on every later midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59, 30))
    const day = effectScope().run(() => useLocalDay())!

    vi.advanceTimersByTime(30_000 + 24 * 60 * 60 * 1000)

    expect(day.value).toBe('2026-10-09')
  })
  it('picks up a later day when the page becomes visible again', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 7, 21, 15))
    const day = effectScope().run(() => useLocalDay())!

    // A backgrounded app's timers are throttled or frozen, so the clock moves
    // on without the midnight timer firing.
    vi.setSystemTime(new Date(2026, 9, 8, 7, 30))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(day.value).toBe('2026-10-08')
  })
  it('stops following the clock once its owner is gone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59, 30))
    const scope = effectScope()
    const day = scope.run(() => useLocalDay())!

    scope.stop()
    vi.advanceTimersByTime(30_000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(day.value).toBe('2026-10-07')
    expect(vi.getTimerCount()).toBe(0)
  })
})
