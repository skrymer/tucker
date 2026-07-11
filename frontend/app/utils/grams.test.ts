import { describe, expect, it } from 'vitest'
import { formatGrams } from './grams'

describe('formatGrams', () => {
  it('rounds to whole grams and appends the unit', () => {
    expect(formatGrams(499.6)).toBe('500 g')
  })

  it('groups thousands with a comma regardless of host locale', () => {
    expect(formatGrams(1400)).toBe('1,400 g')
  })
})
