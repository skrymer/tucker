import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import EstimatedEntryForm from './EstimatedEntryForm.vue'

describe('EstimatedEntryForm', () => {
  it('shows the label, calories, and optional protein fields with a submit button', async () => {
    await renderSuspended(EstimatedEntryForm, {
      props: { date: '2026-05-24' },
    })

    expect(screen.getByLabelText('Label')).toBeVisible()
    expect(screen.getByLabelText('Calories')).toBeVisible()
    expect(screen.getByLabelText('Protein (optional)')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Log estimated entry' }),
    ).toBeVisible()
  })

  it('emits the entry payload when the user logs it', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(EstimatedEntryForm, {
      props: { date: '2026-05-24', onSubmit },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Label'), 'Cafe lunch')
    await user.type(screen.getByLabelText('Calories'), '600')
    await user.click(
      screen.getByRole('button', { name: 'Log estimated entry' }),
    )

    expect(onSubmit).toHaveBeenCalledWith({
      date: '2026-05-24',
      label: 'Cafe lunch',
      calories: 600,
      protein: undefined,
    })
  })

  it('requires a label for the entry', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(EstimatedEntryForm, {
      props: { date: '2026-05-24', onSubmit },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Calories'), '600')
    await user.click(
      screen.getByRole('button', { name: 'Log estimated entry' }),
    )

    expect(screen.getByText('Enter a label for this entry')).toBeVisible()
    expect(
      screen.queryByText('Enter an estimated calorie figure'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires an estimated calorie figure', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(EstimatedEntryForm, {
      props: { date: '2026-05-24', onSubmit },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Label'), 'Cafe lunch')
    await user.click(
      screen.getByRole('button', { name: 'Log estimated entry' }),
    )

    expect(screen.getByText('Enter an estimated calorie figure')).toBeVisible()
    expect(
      screen.queryByText('Enter a label for this entry'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
