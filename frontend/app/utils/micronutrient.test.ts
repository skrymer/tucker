import { describe, expect, it } from 'vitest'
import { formatMicronutrientAmount } from './micronutrient'

describe('formatMicronutrientAmount', () => {
  it('keeps a small figure visible rather than rounding it to nothing', () => {
    expect(formatMicronutrientAmount(0.3, 'µg')).toBe('0.30 µg')
  })

  it('rounds a lower bound down, never up past what the food supplied', () => {
    // Every figure here is prefixed `≥`, so it claims the week supplied *at
    // least* this. Rounding to nearest breaks that claim — 40.6 mg would render
    // as 41 mg, a bound the food does not support (ADR 0027).
    expect(formatMicronutrientAmount(40.6, 'mg')).toBe('40 mg')
    expect(formatMicronutrientAmount(2.19, 'mg')).toBe('2.1 mg')
    expect(formatMicronutrientAmount(0.309, 'µg')).toBe('0.30 µg')
  })

  it('renders a nothing as a plain zero, not a row of decimal places', () => {
    // Below 1 the decimals come from a logarithm, which has nothing to say about
    // zero — without the guard this reads "0.0000 mg".
    expect(formatMicronutrientAmount(0, 'mg')).toBe('0 mg')
  })

  it('drops the decimals a bigger figure has no use for', () => {
    expect(formatMicronutrientAmount(2.14, 'mg')).toBe('2.1 mg')
    expect(formatMicronutrientAmount(2100.4, 'mg')).toBe('2100 mg')
  })

  it('goes on adding decimals for a trace, rather than settling on zero', () => {
    expect(formatMicronutrientAmount(0.004, 'µg')).toBe('0.0040 µg')
  })
})
