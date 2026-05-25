import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import LogEntryBody from './LogEntryBody.vue'

describe('LogEntryBody', () => {
  it('offers an Estimated tab and a Weighed tab', async () => {
    await renderSuspended(LogEntryBody, {
      props: { date: '2026-05-24' },
    })

    expect(screen.getByRole('tab', { name: 'Estimated' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Weighed' })).toBeVisible()
  })

  it('shows the Estimated entry form when the Estimated tab is active', async () => {
    await renderSuspended(LogEntryBody, {
      props: { date: '2026-05-24' },
    })

    // Estimated is the default tab → its form is on screen without
    // any tab clicks.
    expect(screen.getByLabelText('Label')).toBeVisible()
    expect(screen.getByLabelText('Calories')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Log estimated entry' }),
    ).toBeVisible()
  })

  it('emits submitEstimated with the payload when the user logs an estimated entry', async () => {
    const submitEstimated = vi.fn()
    await renderSuspended(LogEntryBody, {
      props: { date: '2026-05-24', onSubmitEstimated: submitEstimated },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Label'), 'Cafe lunch')
    await user.type(screen.getByLabelText('Calories'), '600')
    await user.click(
      screen.getByRole('button', { name: 'Log estimated entry' }),
    )

    expect(submitEstimated).toHaveBeenCalledWith({
      date: '2026-05-24',
      label: 'Cafe lunch',
      calories: 600,
      protein: undefined,
    })
  })

  it('shows a Weighed-tab placeholder until the Weighed flow ships', async () => {
    await renderSuspended(LogEntryBody, {
      props: { date: '2026-05-24' },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('tab', { name: 'Weighed' }))

    expect(screen.getByText(/coming soon/i)).toBeVisible()
  })
})
