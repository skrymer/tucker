import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OTHER_COLOR,
  RING_SLOT_COLORS,
  breakdownWindow,
  foldTail,
  intakeLegend,
} from './intakeBreakdown'
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
    expect(folded.other?.items).toHaveLength(3)
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

  it('returns the items it folded, so opening Other needs no second request', () => {
    const { other } = foldTail(ranked(11))

    expect(other?.items.map((i) => i.name)).toEqual([
      'Food 9',
      'Food 10',
      'Food 11',
    ])
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

describe('breakdownWindow', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks today about the local day alone, so a window of one is not a window of none', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 27, 8, 30))

    expect(breakdownWindow('today')).toEqual({
      from: '2026-08-27',
      to: '2026-08-27',
    })
  })

  it('asks the week about seven days ending on the local today, both bounds inclusive', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 27, 8, 30))

    // Seven days counted inclusively is today and the six before it, so today's
    // Entries are in the week as well as in the day.
    expect(breakdownWindow('week')).toEqual({
      from: '2026-08-21',
      to: '2026-08-27',
    })
  })
})

describe('intakeLegend', () => {
  it('gives each ringed Food its own slot hue, in the order the backend ranked them', () => {
    const { slices, folded } = intakeLegend(ranked(8))

    expect(slices.map((row) => row.name)).toEqual([
      'Food 1',
      'Food 2',
      'Food 3',
      'Food 4',
      'Food 5',
      'Food 6',
      'Food 7',
      'Food 8',
    ])
    expect(slices.map((row) => row.color)).toEqual([...RING_SLOT_COLORS])
    expect(slices.every((row) => row.kind === 'slice')).toBe(true)
    expect(folded).toEqual([])
  })

  it('gives the fold one grey Other naming how many Foods it stands for', () => {
    const { slices } = intakeLegend(ranked(11))

    const other = slices.at(-1)!
    expect(slices).toHaveLength(9)
    expect(other.name).toBe('Other')
    expect(other.kind).toBe('other')
    expect(other.count).toBe(3)
    expect(other.color).toBe(OTHER_COLOR)
    // Never flagged an estimate, whatever the tail it folded held.
    expect(other.isEstimate).toBeUndefined()
  })

  it('keys every row apart, ringed and folded alike', () => {
    // The key is the row's identity twice over: the legend's `v-for` and the
    // ring's category id, where two rows sharing one collapse into a single arc.
    const { slices, folded } = intakeLegend(ranked(11))
    const keys = [...slices, ...folded].map((row) => row.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives a folded row no hue at all, because it is on no arc of the ring', () => {
    const { folded } = intakeLegend(ranked(11))

    expect(folded.map((row) => row.name)).toEqual([
      'Food 9',
      'Food 10',
      'Food 11',
    ])
    expect(folded.every((row) => row.color === undefined)).toBe(true)
    expect(folded.every((row) => row.kind === 'folded')).toBe(true)
  })

  it('carries a folded estimate its own figures and its flag', () => {
    const { folded } = intakeLegend([
      ...ranked(8),
      {
        foodId: null,
        name: 'Work canteen',
        calories: 640,
        protein: null,
        share: 0.4,
        isEstimate: true,
      },
    ])

    expect(folded).toEqual([
      {
        key: 'folded-0',
        kind: 'folded',
        color: undefined,
        name: 'Work canteen',
        calories: 640,
        protein: null,
        share: 0.4,
        isEstimate: true,
      },
    ])
  })
})
