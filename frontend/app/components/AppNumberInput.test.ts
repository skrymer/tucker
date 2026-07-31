import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AppNumberInput from './AppNumberInput.vue'

describe('AppNumberInput', () => {
  it('keeps a figure finer than the step when the field commits', async () => {
    // The whole reason this component exists: the step sizes the arrows, it is
    // not the precision of what is being entered. Left to itself the field
    // re-reads its own display on blur and snaps the result to the step.
    const user = userEvent.setup()
    await renderSuspended(AppNumberInput, {
      attrs: { 'aria-label': 'Grams', step: 10 },
    })

    await user.type(screen.getByLabelText(/grams/i), '247')
    await user.tab()

    expect(screen.getByLabelText(/grams/i)).toHaveDisplayValue('247')
  })

  it('carries the value back out as the field is edited', async () => {
    const onUpdate = vi.fn()
    const user = userEvent.setup()
    await renderSuspended(AppNumberInput, {
      attrs: {
        'aria-label': 'Grams',
        step: 10,
        'onUpdate:modelValue': onUpdate,
      },
    })

    await user.type(screen.getByLabelText(/grams/i), '247')
    await user.tab()

    expect(onUpdate).toHaveBeenCalledWith(247)
  })

  it('lets a call site ask for snapping back', async () => {
    // The component sets a default, not a law — an explicit prop still wins,
    // the same way Nuxt UI resolves its own.
    const user = userEvent.setup()
    await renderSuspended(AppNumberInput, {
      attrs: { 'aria-label': 'Grams', step: 10, stepSnapping: true },
    })

    await user.type(screen.getByLabelText(/grams/i), '247')
    await user.tab()

    expect(screen.getByLabelText(/grams/i)).toHaveDisplayValue('250')
  })
})
