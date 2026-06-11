import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import WeightSection from './WeightSection.vue'

describe('WeightSection', () => {
  it('does not render the measurement list — history lives on its own page', async () => {
    await renderSuspended(WeightSection, {
      props: {
        today: '2026-05-29',
        measurements: [
          { id: 1, measuredOn: '2026-05-26', weightKg: 84.6 },
          { id: 2, measuredOn: '2026-05-27', weightKg: 84.5 },
          { id: 3, measuredOn: '2026-05-28', weightKg: 84.4 },
        ],
      },
    })

    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.queryByText('26 May 2026')).toBeNull()
  })

  it('links to the weight history page when readings exist', async () => {
    await renderSuspended(WeightSection, {
      props: {
        today: '2026-05-29',
        measurements: [
          { id: 1, measuredOn: '2026-05-27', weightKg: 84.5 },
          { id: 2, measuredOn: '2026-05-28', weightKg: 84.4 },
        ],
      },
    })

    const link = screen.getByRole('link', { name: /view history/i })
    expect(link).toBeVisible()
    expect(link).toHaveAttribute('href', '/profile/weight')
  })

  it('summarises the latest reading and its delta', async () => {
    await renderSuspended(WeightSection, {
      props: {
        today: '2026-05-29',
        measurements: [
          { id: 1, measuredOn: '2026-05-27', weightKg: 84.5 },
          { id: 2, measuredOn: '2026-05-28', weightKg: 84.4 },
        ],
      },
    })

    expect(screen.getByText('Latest')).toBeVisible()
    expect(screen.getByLabelText(/down 0\.1 kg/i)).toBeVisible()
  })

  it('shows an empty state when no measurements exist', async () => {
    await renderSuspended(WeightSection, {
      props: { today: '2026-05-29', measurements: [] },
    })

    expect(screen.getByText(/no weight logged yet/i)).toBeVisible()
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.queryByRole('link', { name: /view history/i })).toBeNull()
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
