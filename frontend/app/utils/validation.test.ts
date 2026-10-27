import { describe, expect, it } from 'vitest'
import {
  FOOD_FIGURES,
  foodSchema,
  gramsSchema,
  isOptionalFigure,
} from './validation'

/** A Food as its form holds it once every field is filled in. */
const filled = {
  name: 'Rolled oats',
  proteinPer100g: 13,
  carbsPer100g: 60,
  fatPer100g: 7,
}

/** The messages [foodSchema] refuses [form] with, field by field. */
function refusals(form: Record<string, unknown>) {
  const result = foodSchema.safeParse(form)
  return (result.error?.issues ?? []).map(
    (issue) => `${String(issue.path[0])}: ${issue.message}`,
  )
}

describe('foodSchema', () => {
  it('refuses a Food with no name, and nothing else about it', () => {
    expect(refusals({ ...filled, name: '' })).toEqual([
      'name: Enter a name for this food',
    ])
  })

  it('refuses a Food with no protein figure, and nothing else about it', () => {
    expect(refusals({ ...filled, proteinPer100g: undefined })).toEqual([
      'proteinPer100g: Enter protein per 100 g',
    ])
  })

  it('refuses a Food with no carbs figure, and nothing else about it', () => {
    expect(refusals({ ...filled, carbsPer100g: undefined })).toEqual([
      'carbsPer100g: Enter carbs per 100 g',
    ])
  })

  it('refuses a Food with no fat figure, and nothing else about it', () => {
    expect(refusals({ ...filled, fatPer100g: undefined })).toEqual([
      'fatPer100g: Enter fat per 100 g',
    ])
  })

  it('refuses a negative fibre figure, and nothing else about it', () => {
    expect(refusals({ ...filled, fibrePer100g: -0.1 })).toEqual([
      'fibrePer100g: Fibre can’t be negative',
    ])
  })

  it('accepts a Food whose fibre is left blank, since not stated is not zero', () => {
    expect(refusals({ ...filled, fibrePer100g: undefined })).toEqual([])
    expect(refusals({ ...filled, fibrePer100g: null })).toEqual([])
  })

  it('judges a blank name by what the server trims, not by what JavaScript trims', () => {
    expect(refusals({ ...filled, name: '\u001F' })).toEqual([
      'name: Enter a name for this food',
    ])
    expect(refusals({ ...filled, name: '﻿' })).toEqual([])
  })

  it('refuses a name of only whitespace as no name, as the server would', () => {
    expect(refusals({ ...filled, name: ' \t ' })).toEqual([
      'name: Enter a name for this food',
    ])
  })
})

describe('isOptionalFigure', () => {
  it('holds fibre optional and every macro required', () => {
    expect(FOOD_FIGURES.filter((figure) => isOptionalFigure(figure))).toEqual([
      'fibrePer100g',
    ])
  })
})

describe('gramsSchema', () => {
  it('accepts a positive weight in grams', () => {
    expect(gramsSchema.safeParse(150).success).toBe(true)
  })

  it('rejects a missing weight with the "enter weight" message', () => {
    const result = gramsSchema.safeParse(undefined)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Enter the weight in grams')
  })

  it('rejects a non-positive weight with the "greater than 0" message', () => {
    const result = gramsSchema.safeParse(0)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Grams must be greater than 0',
    )
  })
})
