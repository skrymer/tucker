import { describe, expect, it } from 'vitest'
import { refusalFor } from './goal'

describe('refusalFor', () => {
  it('puts a refusal of the rate on the rate', () => {
    expect(refusalFor('too fast', 'rateKgPerWeek')).toEqual({
      rate: 'too fast',
    })
  })

  it('puts a refusal of the target on the target', () => {
    expect(refusalFor('above the start', 'targetWeightKg')).toEqual({
      target: 'above the start',
    })
  })

  it('puts a refusal naming no field above the submit', () => {
    expect(refusalFor('log a weight first', null)).toEqual({
      form: 'log a weight first',
    })
  })
})
