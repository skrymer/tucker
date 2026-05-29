import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import WeightSection from './WeightSection.vue'

describe('WeightSection', () => {
  it('lists the recorded measurements', async () => {
    await renderSuspended(WeightSection, {
      props: {
        today: '2026-05-29',
        measurements: [
          { id: 1, measuredOn: '2026-05-24', weightKg: 84.6 },
          { id: 2, measuredOn: '2026-05-28', weightKg: 84.2 },
        ],
      },
    })

    expect(screen.getByText('28 May 2026')).toBeVisible()
    expect(screen.getByText('24 May 2026')).toBeVisible()
    expect(screen.queryByText(/no weight logged yet/i)).toBeNull()
  })

  it('shows an empty state when no measurements exist', async () => {
    await renderSuspended(WeightSection, {
      props: { today: '2026-05-29', measurements: [] },
    })

    expect(screen.getByText(/no weight logged yet/i)).toBeVisible()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('opens the date-editable sheet from the Add weight button', async () => {
    await renderSuspended(WeightSection, {
      props: { today: '2026-05-29', measurements: [] },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /add weight/i }))

    expect(screen.getByRole('dialog', { name: /log weight/i })).toBeVisible()
    expect(screen.getByLabelText(/date/i)).toBeVisible()
  })

  it('is non-interactive and explains the prerequisite when disabled', async () => {
    await renderSuspended(WeightSection, {
      props: { today: '2026-05-29', measurements: [], disabled: true },
    })

    expect(screen.getByText(/set your profile first/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: /add weight/i })).toBeNull()
  })

  it('emits logged with the submitted payload', async () => {
    const onLogged = vi.fn()
    await renderSuspended(WeightSection, {
      props: { today: '2026-05-29', measurements: [], onLogged },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /add weight/i }))
    await user.type(screen.getByLabelText(/weight \(kg\)/i), '84.2')
    await user.click(screen.getByRole('button', { name: /save weight/i }))

    expect(onLogged).toHaveBeenCalledWith({
      date: '2026-05-29',
      weightKg: 84.2,
    })
  })
})
