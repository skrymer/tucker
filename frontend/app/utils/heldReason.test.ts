import { describe, expect, it } from 'vitest'
import { HELD_REASON_COPY, type HeldReason } from './heldReason'

// Every reason the backend can send. The `Record` type already makes a missing key
// a compile error, and this list does not change that — a subset would type-check.
// What it adds is that each entry is answered with copy that is actually there,
// on a screen whose whole purpose is to say which condition applied.
const EVERY_REASON: HeldReason[] = [
  'THIN_LOG',
  'UNWEIGHED_WINDOW',
  'NO_WINDOW_ANCHOR',
  'BELOW_BASAL_RATE',
]

describe('HELD_REASON_COPY', () => {
  it('names a qualifier and a remedy for every reason a review can be held for', () => {
    for (const reason of EVERY_REASON) {
      expect(HELD_REASON_COPY[reason]?.qualifier, reason).toBeTruthy()
      expect(HELD_REASON_COPY[reason]?.remedy, reason).toBeTruthy()
    }
  })

  it('tells a daily weigher to wait rather than to weigh in', () => {
    // The two are a step apart in the engine and opposite in what they ask for:
    // one is missing evidence, the other is evidence not yet old enough.
    expect(HELD_REASON_COPY.NO_WINDOW_ANCHOR.remedy).not.toMatch(
      /weigh in once/i,
    )
    expect(HELD_REASON_COPY.UNWEIGHED_WINDOW.remedy).toMatch(/weigh in once/i)
  })
})
