import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  daysInWindow,
  formatDateFromISO,
  localDaysAgo,
  localToday,
  localYesterday,
} from './date'

describe('formatDateFromISO', () => {
  it('formats an ISO date as day, short month, and full year', () => {
    expect(formatDateFromISO('2026-06-03')).toBe('3 Jun 2026')
  })
})

describe('localToday', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the local calendar day as an ISO yyyy-mm-dd string', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 3, 8, 30))
    expect(localToday()).toBe('2026-06-03')
  })
})

describe('localDaysAgo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts back from the local today unless given another day to count from', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 27, 8, 30))

    expect(localDaysAgo(0)).toBe('2026-08-27')
    expect(localDaysAgo(6)).toBe('2026-08-21')
    expect(localDaysAgo(6, '2026-03-04')).toBe('2026-02-26')
  })
})

describe('localYesterday', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the day before the local today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 3, 8, 30))
    expect(localYesterday()).toBe('2026-06-02')
  })

  it('steps back across a month and a year boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 1, 8, 30))
    expect(localYesterday()).toBe('2026-02-28')

    vi.setSystemTime(new Date(2026, 0, 1, 8, 30))
    expect(localYesterday()).toBe('2025-12-31')
  })
})

describe('daysInWindow', () => {
  it('counts both bounds, so a window ending where it starts is one day', () => {
    expect(daysInWindow('2026-08-27', '2026-08-27')).toBe(1)
  })

  it('counts across a month boundary as calendar days, not as date arithmetic', () => {
    expect(daysInWindow('2026-08-21', '2026-08-27')).toBe(7)
    expect(daysInWindow('2026-02-26', '2026-03-04')).toBe(7)
  })

  it('counts a whole number of days across a daylight-saving shift', () => {
    // Northern-hemisphere spring forward. This can only go red in a runner whose
    // timezone observes DST — Brisbane and CI's UTC do not — so it is a guard
    // against the day one does, not evidence the local-midnight form was tried.
    expect(daysInWindow('2026-03-26', '2026-04-01')).toBe(7)
  })
})
