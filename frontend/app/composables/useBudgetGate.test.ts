import { describe, expect, it, vi } from 'vitest'
import { useBudgetGate } from './useBudgetGate'
import type { components } from '#open-fetch-schemas/api'

type BudgetProjectionResponse =
  components['schemas']['BudgetProjectionResponse']
type Payload = { foodId: number; grams: number }

const within: BudgetProjectionResponse = {
  wouldExceedBudget: false,
  projectedCaloriesConsumed: 1900,
  calorieBudget: 2000,
}

const over: BudgetProjectionResponse = {
  wouldExceedBudget: true,
  projectedCaloriesConsumed: 2180,
  calorieBudget: 2000,
  overByKcal: 180,
}

const payload: Payload = { foodId: 1, grams: 100 }

describe('useBudgetGate', () => {
  it('logs immediately when the entry stays within budget', async () => {
    const commit = vi.fn()
    const preview = vi.fn().mockResolvedValue(within)
    const gate = useBudgetGate<Payload>({ preview, commit })

    await gate.attempt(payload)

    expect(commit).toHaveBeenCalledWith(payload)
    expect(gate.warning.value).toBeNull()
  })

  it('warns instead of logging when the entry would exceed the budget', async () => {
    const commit = vi.fn()
    const preview = vi.fn().mockResolvedValue(over)
    const gate = useBudgetGate<Payload>({ preview, commit })

    await gate.attempt(payload)

    expect(commit).not.toHaveBeenCalled()
    expect(gate.warning.value).toEqual({ overByKcal: 180, calorieBudget: 2000 })
  })

  it('ignores a preview that resolves after the form was edited', async () => {
    let resolvePreview!: (value: BudgetProjectionResponse) => void
    const preview = vi.fn(
      () =>
        new Promise<BudgetProjectionResponse>((resolve) => {
          resolvePreview = resolve
        }),
    )
    const commit = vi.fn()
    const gate = useBudgetGate<Payload>({ preview, commit })

    const inFlight = gate.attempt(payload) // preview in flight
    gate.reset() // the user edits a field before it resolves
    resolvePreview(over) // the now-stale projection (for the old values) lands
    await inFlight

    // The stale result must not warn or log against values the user has changed.
    expect(gate.warning.value).toBeNull()
    expect(commit).not.toHaveBeenCalled()
    expect(gate.pending.value).toBe(false) // and the gate is ready for a fresh Save
  })

  it('logs anyway on a second attempt once the warning is showing', async () => {
    const commit = vi.fn()
    const preview = vi.fn().mockResolvedValue(over)
    const gate = useBudgetGate<Payload>({ preview, commit })

    await gate.attempt(payload) // first tap → warns
    await gate.attempt(payload) // deliberate second tap → logs anyway

    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith(payload)
    // The confirm does not re-check; the projection was only run for the first tap.
    expect(preview).toHaveBeenCalledTimes(1)
  })

  it('drops the warning when the form is edited so the next tap re-checks', async () => {
    const commit = vi.fn()
    const preview = vi.fn().mockResolvedValue(over)
    const gate = useBudgetGate<Payload>({ preview, commit })

    await gate.attempt(payload) // warns
    gate.reset() // the user edits the grams

    expect(gate.warning.value).toBeNull()
  })

  it('logs anyway when the projection cannot be computed (fails open)', async () => {
    const commit = vi.fn()
    const preview = vi.fn().mockRejectedValue(new Error('network down'))
    const gate = useBudgetGate<Payload>({ preview, commit })

    await gate.attempt(payload)

    expect(commit).toHaveBeenCalledWith(payload)
    expect(gate.warning.value).toBeNull()
  })

  it('is pending while the projection is in flight and ignores a re-entrant tap', async () => {
    let resolvePreview!: (value: BudgetProjectionResponse) => void
    const preview = vi.fn(
      () =>
        new Promise<BudgetProjectionResponse>((resolve) => {
          resolvePreview = resolve
        }),
    )
    const commit = vi.fn()
    const gate = useBudgetGate<Payload>({ preview, commit })

    const first = gate.attempt(payload)
    expect(gate.pending.value).toBe(true)

    await gate.attempt(payload) // a second tap while the first is still previewing
    expect(preview).toHaveBeenCalledTimes(1)

    resolvePreview(within)
    await first
    expect(gate.pending.value).toBe(false)
  })
})
