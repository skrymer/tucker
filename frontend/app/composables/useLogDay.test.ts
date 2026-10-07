import { describe, expect, it } from 'vitest'
import { useLogDay } from './useLogDay'

const labels = { today: 'Log entry', tomorrow: 'Log for tomorrow' }

describe('useLogDay', () => {
  it('opens on Today, with the submit labelled for today', () => {
    const { day, submitLabel } = useLogDay(() => null, labels)

    expect(day.value).toBe('today')
    expect(submitLabel.value).toBe('Log entry')
  })

  it('labels the submit for tomorrow once Tomorrow is chosen, with no warning', () => {
    const { day, warningMessage, submitLabel } = useLogDay(() => null, labels)

    day.value = 'tomorrow'

    expect(submitLabel.value).toBe('Log for tomorrow')
    expect(warningMessage.value).toBeNull()
  })

  it("warns against the chosen day's budget, and the submit becomes Log anyway", () => {
    const { day, warningMessage, submitLabel } = useLogDay(
      () => ({ overByKcal: 180, calorieBudget: 1900 }),
      labels,
    )

    day.value = 'tomorrow'

    expect(warningMessage.value).toBe(
      "This puts you ~180 kcal over tomorrow's 1900 budget.",
    )
    expect(submitLabel.value).toBe('Log anyway')
  })
})
