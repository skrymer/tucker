import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import LogFoodSheet from './LogFoodSheet.vue'

const skyr = {
  id: 1,
  name: 'Skyr',
  kind: 'raw',
  caloriesPer100g: 63.7,
  proteinPer100g: 11.4,
}

describe('LogFoodSheet', () => {
  it('shows a sheet named for the food with a grams field when a food is set', async () => {
    await renderSuspended(LogFoodSheet, { props: { food: skyr } })

    expect(screen.getByRole('dialog', { name: 'Log Skyr' })).toBeVisible()
    expect(screen.getByLabelText(/weight \(g\)/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /log entry/i })).toBeVisible()
  })

  it('shows no sheet when no food is set', async () => {
    await renderSuspended(LogFoodSheet, { props: { food: null } })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('focuses the grams field when the sheet opens', async () => {
    await renderSuspended(LogFoodSheet, { props: { food: skyr } })

    await waitFor(() =>
      expect(screen.getByLabelText(/weight \(g\)/i)).toHaveFocus(),
    )
  })

  it("emits log with the food's id and the entered grams on submit", async () => {
    const onLog = vi.fn()
    await renderSuspended(LogFoodSheet, { props: { food: skyr, onLog } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '150')
    await user.click(screen.getByRole('button', { name: /log entry/i }))

    expect(onLog).toHaveBeenCalledWith({ foodId: 1, grams: 150 })
  })

  it('shows the "enter weight" message when the form is submitted empty', async () => {
    const onLog = vi.fn()
    await renderSuspended(LogFoodSheet, { props: { food: skyr, onLog } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /log entry/i }))

    expect(await screen.findByText(/enter the weight in grams/i)).toBeVisible()
    expect(screen.queryByText(/grams must be greater than 0/i)).toBeNull()
    expect(onLog).not.toHaveBeenCalled()
  })

  it('emits close when the user dismisses the sheet', async () => {
    const onClose = vi.fn()
    await renderSuspended(LogFoodSheet, { props: { food: skyr, onClose } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalled()
  })

  it('starts blank when reopened after a previous entry was typed', async () => {
    const { rerender } = await renderSuspended(LogFoodSheet, {
      props: { food: skyr },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '150')
    await rerender({ food: null })
    await rerender({ food: skyr })

    expect(screen.getByLabelText(/weight \(g\)/i)).toHaveValue('')
  })

  it('rejects negative grams', async () => {
    const onLog = vi.fn()
    await renderSuspended(LogFoodSheet, { props: { food: skyr, onLog } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '-50')
    await user.click(screen.getByRole('button', { name: /log entry/i }))

    expect(
      await screen.findByText(/grams must be greater than 0/i),
    ).toBeVisible()
    expect(onLog).not.toHaveBeenCalled()
  })

  it('rejects zero grams', async () => {
    const onLog = vi.fn()
    await renderSuspended(LogFoodSheet, { props: { food: skyr, onLog } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '0')
    await user.click(screen.getByRole('button', { name: /log entry/i }))

    expect(
      await screen.findByText(/grams must be greater than 0/i),
    ).toBeVisible()
    expect(screen.queryByText(/enter the weight in grams/i)).toBeNull()
    expect(onLog).not.toHaveBeenCalled()
  })
})
