import { describe, expect, it } from 'vitest'
import {
  formatMicronutrientAmount,
  formatMicronutrientFigures,
} from './micronutrient'

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

describe('formatMicronutrientFigures', () => {
  it('spends enough decimals to show the bound above the line', () => {
    // At the magnitude precision both of these read `2000 mg`, and two identical
    // numbers under a strict claim read as a fault rather than as a tight margin.
    expect(formatMicronutrientFigures(2000.4, 2000, 'mg', true)).toEqual({
      bound: '≥ 2000.4 mg',
      line: '2000.0 mg',
    })
  })

  it('lets the operator carry a margin no readable precision can show', () => {
    // Four decimals is where a trace stops earning digits, and this margin is past
    // it. `>` is true of everything the claim admits, so the tie goes to the
    // operator rather than being spelled out in zeroes.
    expect(formatMicronutrientFigures(2000.00001, 2000, 'mg', true)).toEqual({
      bound: '> 2000 mg',
      line: '2000 mg',
    })
  })

  it('spends no decimals on a margin the whole numbers already show', () => {
    expect(formatMicronutrientFigures(2430, 2000, 'mg', true)).toEqual({
      bound: '≥ 2430 mg',
      line: '2000 mg',
    })
  })

  it('rounds the bound down at the precision the pair settled on', () => {
    // The extra decimal is there to show the margin, not to round to nearest —
    // `≥ 2000.5 mg` would state a bound the food does not support (ADR 0027).
    expect(formatMicronutrientFigures(2000.49, 2000, 'mg', true)).toEqual({
      bound: '≥ 2000.4 mg',
      line: '2000.0 mg',
    })
  })

  it('spends its last decimal before handing the margin to the operator', () => {
    // Four decimals is the ceiling on the search, not the precision it declines to
    // try: this pair separates only there, and giving up one short would draw
    // `> 2000 mg` over `2000 mg` — the same two identical numbers.
    expect(formatMicronutrientFigures(2000.0001, 2000, 'mg', true)).toEqual({
      bound: '≥ 2000.0001 mg',
      line: '2000.0000 mg',
    })
  })

  it('reads a claim that is not strict one figure at a time', () => {
    // `≥ 1.2 mg` against a 1.2 mg reference is exactly what clearing a reference
    // means, so nothing is spent separating the two.
    expect(formatMicronutrientFigures(1.24, 1.2, 'mg', false)).toEqual({
      bound: '≥ 1.2 mg',
      line: '1.2 mg',
    })
  })

  it('never states a line at a coarser precision than it was published at', () => {
    // The shared precision a strict pair settles on is measured up from the finer of
    // the two, not from the bound's. Every published limit is a whole number today,
    // and reading the line's precision off the bound would restate a fractional one
    // — 1.7 mg published, 1 mg drawn — the day one is published.
    expect(formatMicronutrientFigures(12.3, 1.7, 'mg', true)).toEqual({
      bound: '≥ 12.3 mg',
      line: '1.7 mg',
    })
  })
})
