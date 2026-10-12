import { describe, expect, it } from 'vitest'
import { visibleGrid } from './calendarGrid'

describe('visibleGrid', () => {
  it('opens a month that starts on a Monday on its first day, six weeks long', () => {
    expect(visibleGrid('2026-06', 1)).toEqual({
      from: '2026-06-01',
      to: '2026-07-12',
    })
  })

  it('starts on the Sunday on or before the first day for a Sunday-start week', () => {
    expect(visibleGrid('2026-10', 0)).toEqual({
      from: '2026-09-27',
      to: '2026-11-07',
    })
  })

  // Characterises the general rule the first case drove: the widest spill-over.
  it('reaches six days back for a month that starts on a Sunday', () => {
    expect(visibleGrid('2026-02', 1)).toEqual({
      from: '2026-01-26',
      to: '2026-03-08',
    })
  })

  // Characterises the same rule across a year boundary, both ways.
  it('crosses into the year before and the month after for a January', () => {
    expect(visibleGrid('2027-01', 1)).toEqual({
      from: '2026-12-28',
      to: '2027-02-07',
    })
  })
})
