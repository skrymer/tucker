import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import MaintenanceStatus from './MaintenanceStatus.vue'

describe('MaintenanceStatus', () => {
  it('shows a maintaining status with a "Start a goal" CTA', async () => {
    await renderSuspended(MaintenanceStatus)

    expect(screen.getByText(/maintaining/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /start a goal/i })).toBeVisible()
  })

  it('shows the formatted reached date when maintaining since a reached goal', async () => {
    await renderSuspended(MaintenanceStatus, { props: { since: '2026-06-03' } })

    // Assert the whole phrase, not just the date — the space between
    // "maintaining" and "since" must survive Vue's whitespace condensing.
    expect(
      screen.getByRole('heading', { name: /maintaining/i }),
    ).toHaveTextContent(/you're maintaining since 3 Jun 2026\./i)
  })

  it('emits start-goal when the CTA is clicked', async () => {
    const onStartGoal = vi.fn()
    await renderSuspended(MaintenanceStatus, {
      props: { onStartGoal },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /start a goal/i }))

    expect(onStartGoal).toHaveBeenCalledOnce()
  })
})
