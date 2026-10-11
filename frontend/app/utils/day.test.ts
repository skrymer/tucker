import { describe, expect, it } from 'vitest'
import { dayHeading, relativeDayHeading } from './day'

describe('dayHeading', () => {
  it('names today and tomorrow, and states any other day plainly', () => {
    const today = '2026-12-31'
    expect(dayHeading('2026-12-31', today)).toBe('Today · Thu 31 Dec')
    // Tomorrow across a year end.
    expect(dayHeading('2027-01-01', today)).toBe('Tomorrow · Fri 1 Jan')
    expect(dayHeading('2026-12-30', today)).toBe('Wed 30 Dec')
    expect(dayHeading('2027-01-02', today)).toBe('Sat 2 Jan')
  })
})

describe('relativeDayHeading', () => {
  it('names the day and states its date', () => {
    expect(relativeDayHeading('today', '2026-10-07')).toBe('Today · Wed 7 Oct')
    expect(relativeDayHeading('tomorrow', '2026-10-08')).toBe(
      'Tomorrow · Thu 8 Oct',
    )
  })
})
