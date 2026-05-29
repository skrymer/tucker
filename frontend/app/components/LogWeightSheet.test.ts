import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import LogWeightSheet from './LogWeightSheet.vue'

describe('LogWeightSheet', () => {
  it('shows the log-weight form when open', async () => {
    await renderSuspended(LogWeightSheet, {
      props: { open: true, date: '2026-05-29' },
    })

    expect(screen.getByRole('dialog', { name: /log weight/i })).toBeVisible()
    expect(screen.getByLabelText(/weight \(kg\)/i)).toBeVisible()
  })

  it('emits a submit payload with the locked date and entered weight', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(LogWeightSheet, {
      props: { open: true, date: '2026-05-29', onSubmit },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(kg\)/i), '84.2')
    await user.click(screen.getByRole('button', { name: /save weight/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      date: '2026-05-29',
      weightKg: 84.2,
    })
  })

  it('shows the "enter weight" message when the form is submitted empty', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(LogWeightSheet, {
      props: { open: true, date: '2026-05-29', onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save weight/i }))

    expect(await screen.findByText(/enter your weight in kg/i)).toBeVisible()
    expect(screen.queryByText(/weight must be greater than 0/i)).toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('prefills the weight field from initialWeightKg', async () => {
    await renderSuspended(LogWeightSheet, {
      props: { open: true, date: '2026-05-29', initialWeightKg: 84.2 },
    })

    expect(screen.getByLabelText(/weight \(kg\)/i)).toHaveValue('84.2')
  })

  it('hides the date input when the date prop locks it', async () => {
    await renderSuspended(LogWeightSheet, {
      props: { open: true, date: '2026-05-29' },
    })

    expect(screen.queryByLabelText(/date/i)).toBeNull()
  })

  it('rejects a non-positive weight', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(LogWeightSheet, {
      props: { open: true, date: '2026-05-29', onSubmit },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(kg\)/i), '0')
    await user.click(screen.getByRole('button', { name: /save weight/i }))

    expect(
      await screen.findByText(/weight must be greater than 0/i),
    ).toBeVisible()
    expect(screen.queryByText(/enter your weight in kg/i)).toBeNull()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
