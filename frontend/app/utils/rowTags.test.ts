import { describe, expect, it } from 'vitest'
import { rowTags } from './rowTags'

describe('rowTags', () => {
  it('shows five Tags whole', () => {
    const five = ['a', 'b', 'c', 'd', 'e']

    expect(rowTags(five)).toEqual({ shown: five, hidden: 0 })
  })

  it('shows four and counts the rest once there are six, so the count never hides just one', () => {
    expect(rowTags(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({
      shown: ['a', 'b', 'c', 'd'],
      hidden: 2,
    })
  })
})
