import { describe, expect, it } from 'vitest'
import { dayStatusVerdict } from './day-status'

describe('dayStatusVerdict', () => {
  it('shows on target as a success verdict', () => {
    expect(dayStatusVerdict('on-target')).toEqual({
      label: 'On target',
      icon: 'i-lucide-circle-check',
      class: 'text-success',
    })
  })

  it('shows over budget as an error verdict', () => {
    expect(dayStatusVerdict('over-budget')).toEqual({
      label: 'Over budget',
      icon: 'i-lucide-circle-x',
      class: 'text-error',
    })
  })

  it('earns no verdict while the day is in progress', () => {
    expect(dayStatusVerdict('in-progress')).toBeNull()
  })

  it('earns no verdict before the first review, when the status is absent', () => {
    expect(dayStatusVerdict(null)).toBeNull()
    expect(dayStatusVerdict(undefined)).toBeNull()
  })
})
