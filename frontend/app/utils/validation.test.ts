import { describe, expect, it } from 'vitest'
import { gramsSchema } from './validation'

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
