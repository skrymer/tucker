import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ReachedGoalBanner from './ReachedGoalBanner.vue'

const props = {
  targetWeightKg: 80,
  currentTrendKg: 79.9,
  reachedOn: '2026-06-05',
}

describe('ReachedGoalBanner', () => {
  it('announces the reached milestone with the target weight', async () => {
    await renderSuspended(ReachedGoalBanner, { props })

    expect(
      screen.getByRole('heading', { name: /you reached your goal/i }),
    ).toBeVisible()
    expect(screen.getByText(/80\.0 kg/)).toBeVisible()
  })

  it('switches to maintenance when the user clicks Switch to maintenance', async () => {
    const onSwitchToMaintenance = vi.fn()
    await renderSuspended(ReachedGoalBanner, {
      props: { ...props, onSwitchToMaintenance },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /switch to maintenance/i }))

    expect(onSwitchToMaintenance).toHaveBeenCalledOnce()
  })

  it('offers setting a lower goal via a link to the profile', async () => {
    await renderSuspended(ReachedGoalBanner, { props })

    const lowerGoal = screen.getByRole('link', { name: /set a lower goal/i })
    expect(lowerGoal).toHaveAttribute('href', '/profile')
  })

  it('offers no way to dismiss the reached fork', async () => {
    await renderSuspended(ReachedGoalBanner, { props })

    // The fork is insistent (ADR 0008): only the two resolving actions, no close.
    expect(
      screen.queryByRole('button', { name: /close/i }),
    ).not.toBeInTheDocument()
  })
})
