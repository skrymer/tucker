import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import GoalForm from './GoalForm.vue'

const latestWeight = { id: 1, measuredOn: '2026-05-28', weightKg: 86.0 }
const today = new Date().toLocaleDateString('en-CA')

describe('GoalForm', () => {
  it('shows the read-only start weight with its reading date, plus target and rate inputs', async () => {
    await renderSuspended(GoalForm, { props: { latestWeight } })

    expect(screen.getByText(/starting weight/i)).toBeVisible()
    const value = screen.getByText(/86\.0 kg/)
    expect(value).toBeVisible()
    expect(value).toHaveTextContent('28 May 2026')

    expect(screen.getByLabelText(/target weight/i)).toBeVisible()
    expect(screen.getByLabelText(/rate/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /set.*goal/i })).toBeVisible()
  })

  it('emits the goal payload anchored to today and the latest weight', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(GoalForm, { props: { latestWeight, onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/target weight/i), '80')
    await user.type(screen.getByLabelText(/rate/i), '0.5')
    await user.click(screen.getByRole('button', { name: /set.*goal/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      startedOn: today,
      startWeightKg: 86.0,
      targetWeightKg: 80,
      rateKgPerWeek: 0.5,
    })
  })

  const allMessages = [
    'Enter a target weight',
    'Target weight must be greater than 0',
    'Target must be below your start weight',
    'Enter a weekly rate',
    'Rate must be at least 0.05 kg/week',
    'Rate must be at most 1.5 kg/week',
  ]

  function expectOnlyMessage(shown: string) {
    expect(screen.getByText(shown)).toBeVisible()
    for (const other of allMessages.filter((m) => m !== shown)) {
      expect(screen.queryByText(other)).not.toBeInTheDocument()
    }
  }

  it('requires a target weight', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(GoalForm, { props: { latestWeight, onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/rate/i), '0.5')
    await user.click(screen.getByRole('button', { name: /set.*goal/i }))

    expectOnlyMessage('Enter a target weight')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a target weight at or above the start weight', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(GoalForm, { props: { latestWeight, onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/target weight/i), '86')
    await user.type(screen.getByLabelText(/rate/i), '0.5')
    await user.click(screen.getByRole('button', { name: /set.*goal/i }))

    expectOnlyMessage('Target must be below your start weight')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires a weekly rate', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(GoalForm, { props: { latestWeight, onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/target weight/i), '80')
    await user.click(screen.getByRole('button', { name: /set.*goal/i }))

    expectOnlyMessage('Enter a weekly rate')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('surfaces a server-rejected target as an error under the target field', async () => {
    // The live Trend Weight isn't known on the client, so the trend-weight rule
    // (ADR 0008) is enforced by the backend; its 400 is fed back in as targetError.
    await renderSuspended(GoalForm, {
      props: {
        latestWeight,
        targetError:
          'a weight-loss Goal needs a target below your current trend weight (86.2 kg)',
      },
    })

    expect(
      screen.getByText(
        'a weight-loss Goal needs a target below your current trend weight (86.2 kg)',
      ),
    ).toBeVisible()
  })

  it('rejects a rate below the 0.05 kg/week floor', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(GoalForm, { props: { latestWeight, onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/target weight/i), '80')
    await user.type(screen.getByLabelText(/rate/i), '0.04')
    await user.click(screen.getByRole('button', { name: /set.*goal/i }))

    expectOnlyMessage('Rate must be at least 0.05 kg/week')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a rate above the 1.5 kg/week ceiling', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(GoalForm, { props: { latestWeight, onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/target weight/i), '80')
    await user.type(screen.getByLabelText(/rate/i), '1.51')
    await user.click(screen.getByRole('button', { name: /set.*goal/i }))

    expectOnlyMessage('Rate must be at most 1.5 kg/week')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
