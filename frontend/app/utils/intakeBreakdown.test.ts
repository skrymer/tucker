import { describe, expect, it } from 'vitest'
import { foldTail } from './intakeBreakdown'
import type { BreakdownItem } from './intakeBreakdown'

function item(
  name: string,
  calories: number,
  protein: number | null = 10,
): BreakdownItem {
  return { foodId: null, name, calories, protein, share: 0, isEstimate: false }
}

/** `count` slices, each smaller than the last, as the backend ranks them. */
function ranked(count: number): BreakdownItem[] {
  return Array.from({ length: count }, (_, i) => item(`Food ${i + 1}`, 100 - i))
}

describe('foldTail', () => {
  it('leaves a breakdown that fits the palette whole, with nothing folded away', () => {
    const folded = foldTail(ranked(8))

    expect(folded.ringItems.map((i) => i.name)).toEqual([
      'Food 1',
      'Food 2',
      'Food 3',
      'Food 4',
      'Food 5',
      'Food 6',
      'Food 7',
      'Food 8',
    ])
    expect(folded.other).toBeNull()
  })

  it('folds everything past the eighth slice into one Other naming how many it holds', () => {
    const folded = foldTail(ranked(11))

    expect(folded.ringItems).toHaveLength(8)
    expect(folded.ringItems.at(-1)!.name).toBe('Food 8')
    expect(folded.other?.count).toBe(3)
  })

  it("gives Other the tail's summed calories and share, so the ring still sums to the window", () => {
    const items = [
      ...ranked(8),
      { ...item('Ninth', 30), share: 0.03 },
      { ...item('Tenth', 20), share: 0.02 },
    ]

    const { other } = foldTail(items)

    expect(other?.calories).toBe(50)
    expect(other?.share).toBeCloseTo(0.05, 10)
  })

  it('states no protein for Other unless every Food it folded carried a figure', () => {
    const whole = foldTail([
      ...ranked(8),
      item('Ninth', 30, 12),
      item('Tenth', 20, 8),
    ])
    // One unknown among several known is the dangerous case: summing what is
    // known would put a confident figure against a row whose calories are mostly
    // unmeasured, and Other carries no `est.` flag to hint at it.
    const partial = foldTail([
      ...ranked(8),
      item('Ninth', 30, 12),
      item('Tenth', 20, null),
    ])
    const none = foldTail([
      ...ranked(8),
      item('Ninth', 30, null),
      item('Tenth', 20, null),
    ])

    expect(whole.other?.protein).toBe(20)
    expect(partial.other?.protein).toBeNull()
    expect(none.other?.protein).toBeNull()
  })
})
