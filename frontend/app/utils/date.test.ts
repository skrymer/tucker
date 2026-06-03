import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDateFromISO, localToday } from './date'

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
