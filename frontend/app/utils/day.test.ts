import { describe, expect, it } from 'vitest'
import { relativeDayHeading } from './day'

describe('relativeDayHeading', () => {
  it('names the day and states its date', () => {
    expect(relativeDayHeading('today', '2026-10-07')).toBe('Today · Wed 7 Oct')
    expect(relativeDayHeading('tomorrow', '2026-10-08')).toBe(
      'Tomorrow · Thu 8 Oct',
    )
  })
})
