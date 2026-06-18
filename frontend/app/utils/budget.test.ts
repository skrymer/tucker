import { describe, expect, it } from 'vitest'
import { formatBudgetWarning } from './budget'

describe('formatBudgetWarning', () => {
  it('phrases how far over the budget the entry would put the day', () => {
    expect(formatBudgetWarning({ overByKcal: 180, calorieBudget: 2000 })).toBe(
      'This puts you ~180 kcal over your 2000 budget.',
    )
  })

  it('rounds the over-by and budget figures to whole calories', () => {
    expect(
      formatBudgetWarning({ overByKcal: 105.6, calorieBudget: 1970.2 }),
    ).toBe('This puts you ~106 kcal over your 1970 budget.')
  })

  it('has no message when within budget', () => {
    expect(formatBudgetWarning(null)).toBeNull()
    expect(formatBudgetWarning(undefined)).toBeNull()
  })
})
