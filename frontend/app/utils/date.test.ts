import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDateFromISO, localToday, localYesterday } from './date'

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
