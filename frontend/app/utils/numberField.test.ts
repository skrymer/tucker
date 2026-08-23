import { describe, expect, it } from 'vitest'
import { isSameToDisplayedPrecision } from './numberField'

describe('isSameToDisplayedPrecision', () => {
  it('treats a value and its own displayed rounding as the same figure', () => {
    // A number field renders through Intl, which stops at three decimals, then
    // hands that rounded figure back on the next blur. Read raw, that looks
    // like an edit the user never made.
    expect(isSameToDisplayedPrecision(8.928571428571429, 8.929)).toBe(true)
    expect(isSameToDisplayedPrecision(100.1 + 200.2, 300.3)).toBe(true)
  })

  it('treats a figure that displays on a half-way boundary as the same figure', () => {
    // Scaling by a thousand and rounding is not the rounding the field does.
    // 65.0255 lands a hair under the tie once scaled (65025.49999999999) and
    // breaks down, while the 65.026 the field shows and hands back lands a hair
    // under the next integer and breaks up — so the two disagree over a figure
    // the user only ever saw one of.
    expect(isSameToDisplayedPrecision(65.0255, 65.026)).toBe(true)
    expect(isSameToDisplayedPrecision(0.5045, 0.505)).toBe(true)
  })

  it('still sees a change the field could actually show', () => {
    expect(isSameToDisplayedPrecision(300.3, 310.3)).toBe(false)
    expect(isSameToDisplayedPrecision(8.57, 8.6)).toBe(false)
    // The smallest step any field uses is 0.05 — comfortably visible.
    expect(isSameToDisplayedPrecision(1.5, 1.55)).toBe(false)
  })

  it('treats a blank field as unchanged only against another blank', () => {
    expect(isSameToDisplayedPrecision(undefined, undefined)).toBe(true)
    expect(isSameToDisplayedPrecision(undefined, 0)).toBe(false)
    expect(isSameToDisplayedPrecision(0, undefined)).toBe(false)
  })

  it('tells a blank field from one holding a figure that cannot be shown', () => {
    // The guard above the formatter is what makes this hold, and this is the
    // only pairing that needs it: Intl renders a blank and a NaN as the same
    // "NaN", so compared through the display alone the two would read as one
    // figure and a real edit between them would be dropped as a tab-through.
    expect(isSameToDisplayedPrecision(undefined, NaN)).toBe(false)
    expect(isSameToDisplayedPrecision(NaN, undefined)).toBe(false)
  })
})
