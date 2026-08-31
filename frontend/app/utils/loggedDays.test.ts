import { describe, expect, it } from 'vitest'
import { loggedDaysCaption } from './loggedDays'

describe('loggedDaysCaption', () => {
  it('discounts a window by how much of it was logged', () => {
    expect(loggedDaysCaption(3, '2026-08-21', '2026-08-27')).toBe(
      '3 of 7 days logged',
    )
  })

  it('says nothing about a single day, whose count is only none or all', () => {
    // A zero there already reads as "Nothing logged yet" right below it, so the
    // caption would be restating the thing beside it.
    expect(loggedDaysCaption(0, '2026-08-27', '2026-08-27')).toBeNull()
  })
})
