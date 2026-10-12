import { describe, expect, it } from 'vitest'
import { visibleGrid } from './calendarGrid'

describe('visibleGrid', () => {
  it('opens a month that starts on a Monday on its first day, six weeks long', () => {
    expect(visibleGrid('2026-06')).toEqual({
      from: '2026-06-01',
      to: '2026-07-12',
    })
  })

  // Characterises the general rule the first case drove: the widest spill-over.
  it('reaches six days back for a month that starts on a Sunday', () => {
    expect(visibleGrid('2026-02')).toEqual({
      from: '2026-01-26',
      to: '2026-03-08',
    })
  })

  // Characterises the same rule across a year boundary, both ways.
  it('crosses into the year before and the month after for a January', () => {
    expect(visibleGrid('2027-01')).toEqual({
      from: '2026-12-28',
      to: '2027-02-07',
    })
  })
})
