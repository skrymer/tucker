import { afterEach, describe, expect, it, vi } from 'vitest'
import { earliestBirthDate, latestBirthDate, MAX_AGE_YEARS } from './birthDate'

describe('birth-date bounds', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ends the day before the local today, so today itself is out of range', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 13, 9, 0))

    expect(latestBirthDate()).toBe('2026-09-12')
  })

  it('begins a whole lifetime back, counted in calendar years', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 13, 9, 0))

    expect(MAX_AGE_YEARS).toBe(120)
    expect(earliestBirthDate()).toBe('1906-09-13')
  })

  it('moves with the day, so a form left open overnight bounds on the new one', () => {
    // Read at call time, never frozen at import: Tucker is an installed PWA whose
    // tab outlives midnight, and a bound captured once would then offer a day the
    // API refuses.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 13, 23, 59))
    expect(latestBirthDate()).toBe('2026-09-12')

    vi.setSystemTime(new Date(2026, 8, 14, 0, 1))
    expect(latestBirthDate()).toBe('2026-09-13')
  })
})
