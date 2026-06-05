import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import GoalSection from './GoalSection.vue'

const latestWeight = { id: 1, measuredOn: '2026-05-28', weightKg: 86.0 }

const activeGoal = {
  id: 7,
  startedOn: '2026-05-01',
  startWeightKg: 90.0,
  targetWeightKg: 80.0,
  rateKgPerWeek: 0.5,
  active: true,
  dailyDeficitKcal: 550.0,
}

const pastGoal = {
  id: 3,
  startedOn: '2026-02-01',
  startWeightKg: 95.0,
  targetWeightKg: 85.0,
  rateKgPerWeek: 0.75,
  active: false,
  dailyDeficitKcal: 825.0,
}

describe('GoalSection', () => {
  it('shows a maintenance status with a "Start a goal" CTA when no goal is active', async () => {
    await renderSuspended(GoalSection, {
      props: { goals: [], latestWeight },
    })

    expect(screen.getByRole('heading', { name: /^goal$/i })).toBeVisible()
    expect(screen.getByText(/maintaining/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /start a goal/i })).toBeVisible()
    // The form stays behind the CTA — the durable status is the resting state.
    expect(screen.queryByLabelText(/target weight/i)).not.toBeInTheDocument()
  })

  it('reveals the goal form when "Start a goal" is clicked and emits the new goal', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(GoalSection, {
      props: { goals: [], latestWeight, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /start a goal/i }))

    const target = screen.getByLabelText(/target weight/i)
    expect(target).toBeVisible()
    await user.type(target, '78')
    await user.type(screen.getByLabelText(/rate/i), '0.6')
    await user.click(screen.getByRole('button', { name: /^set goal$/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        startWeightKg: 86.0,
        targetWeightKg: 78,
        rateKgPerWeek: 0.6,
      }),
    )
  })

  it('shows "since {date}" from the most recently reached goal when maintaining', async () => {
    await renderSuspended(GoalSection, {
      props: {
        goals: [
          { ...pastGoal, reachedOn: '2026-05-20' },
          { ...activeGoal, active: false, reachedOn: '2026-06-03' },
        ],
        latestWeight,
      },
    })

    expect(screen.getByText(/since 3 Jun 2026/i)).toBeVisible()
  })

  it('hides the maintenance status and CTA while a goal is active', async () => {
    await renderSuspended(GoalSection, {
      props: { goals: [activeGoal], latestWeight },
    })

    expect(screen.queryByText(/maintaining/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /start a goal/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the active goal as a card with a "Set a new goal" button, form hidden', async () => {
    await renderSuspended(GoalSection, {
      props: { goals: [activeGoal], latestWeight },
    })

    // Card values are visible.
    expect(screen.getByText(/80\.0 kg/)).toBeVisible()
    expect(screen.getByText(/0\.5 kg\/week/)).toBeVisible()

    // The replacement affordance reads "Set a new goal", never "Edit goal".
    expect(
      screen.getByRole('button', { name: /set a new goal/i }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /edit goal/i }),
    ).not.toBeInTheDocument()

    // The form is not shown until the user asks to set a new goal.
    expect(screen.queryByLabelText(/target weight/i)).not.toBeInTheDocument()
  })

  it('reveals the form when "Set a new goal" is clicked and emits the new goal', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(GoalSection, {
      props: { goals: [activeGoal], latestWeight, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /set a new goal/i }))

    const target = screen.getByLabelText(/target weight/i)
    expect(target).toBeVisible()
    await user.type(target, '78')
    await user.type(screen.getByLabelText(/rate/i), '0.6')
    await user.click(screen.getByRole('button', { name: /^set goal$/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        startWeightKg: 86.0,
        targetWeightKg: 78,
        rateKgPerWeek: 0.6,
      }),
    )
  })

  it('keeps the replacement form open after submitting so a rejected target can surface', async () => {
    await renderSuspended(GoalSection, {
      props: { goals: [activeGoal], latestWeight },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /set a new goal/i }))
    await user.type(screen.getByLabelText(/target weight/i), '78')
    await user.type(screen.getByLabelText(/rate/i), '0.6')
    await user.click(screen.getByRole('button', { name: /^set goal$/i }))

    // The form closes on success (the parent replaces the active goal), not
    // optimistically on submit — otherwise a backend rejection routed into the
    // target field would have nowhere to render and vanish silently.
    expect(screen.getByLabelText(/target weight/i)).toBeVisible()
  })

  it('keeps past goals in a history list that is collapsed by default', async () => {
    await renderSuspended(GoalSection, {
      props: { goals: [activeGoal, pastGoal], latestWeight },
    })
    const user = userEvent.setup()

    // The active goal's start date is always visible; the past goal's is not,
    // until the history is expanded.
    expect(screen.getByText(/1 May 2026/)).toBeVisible()
    expect(screen.queryByText(/1 Feb 2026/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /past goals/i }))

    expect(screen.getByText(/1 Feb 2026/)).toBeVisible()
  })

  it('is non-interactive and explains the prerequisite when disabled', async () => {
    await renderSuspended(GoalSection, {
      props: { goals: [], latestWeight: null, disabled: true },
    })

    expect(screen.getByRole('heading', { name: /^goal$/i })).toBeVisible()
    expect(screen.getByText(/log your weight first/i)).toBeVisible()
    expect(screen.queryByLabelText(/target weight/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /set a new goal/i }),
    ).not.toBeInTheDocument()
  })

  it('shows no history affordance when there are no past goals', async () => {
    await renderSuspended(GoalSection, {
      props: { goals: [activeGoal], latestWeight },
    })

    expect(
      screen.queryByRole('button', { name: /past goals/i }),
    ).not.toBeInTheDocument()
  })
})
