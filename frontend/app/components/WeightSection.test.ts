import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
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

    const list = screen.getByRole('list')
    expect(within(list).getByText('28 May 2026')).toBeVisible()
    expect(within(list).getByText('24 May 2026')).toBeVisible()
    expect(screen.queryByText(/no weight logged yet/i)).toBeNull()
  })

  it('offers no Show all control when five or fewer readings exist', async () => {
    await renderSuspended(WeightSection, {
      props: {
        today: '2026-05-29',
        measurements: [
          { id: 1, measuredOn: '2026-05-25', weightKg: 84.7 },
          { id: 2, measuredOn: '2026-05-26', weightKg: 84.6 },
          { id: 3, measuredOn: '2026-05-27', weightKg: 84.5 },
          { id: 4, measuredOn: '2026-05-28', weightKg: 84.4 },
          { id: 5, measuredOn: '2026-05-29', weightKg: 84.3 },
        ],
      },
    })

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()
  })

  it('shows only the five most recent readings before Show all', async () => {
    await renderSuspended(WeightSection, {
      props: {
        today: '2026-05-29',
        measurements: [
          { id: 1, measuredOn: '2026-05-22', weightKg: 85.0 },
          { id: 2, measuredOn: '2026-05-23', weightKg: 84.9 },
          { id: 3, measuredOn: '2026-05-24', weightKg: 84.8 },
          { id: 4, measuredOn: '2026-05-25', weightKg: 84.7 },
          { id: 5, measuredOn: '2026-05-26', weightKg: 84.6 },
          { id: 6, measuredOn: '2026-05-27', weightKg: 84.5 },
          { id: 7, measuredOn: '2026-05-28', weightKg: 84.4 },
        ],
      },
    })

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    const list = screen.getByRole('list')
    expect(within(list).getByText('28 May 2026')).toBeVisible()
    expect(within(list).getByText('24 May 2026')).toBeVisible()
    expect(screen.queryByText('23 May 2026')).toBeNull()
    expect(screen.queryByText('22 May 2026')).toBeNull()
  })

  it('reveals the remaining readings when Show all is clicked', async () => {
    await renderSuspended(WeightSection, {
      props: {
        today: '2026-05-29',
        measurements: [
          { id: 1, measuredOn: '2026-05-22', weightKg: 85.0 },
          { id: 2, measuredOn: '2026-05-23', weightKg: 84.9 },
          { id: 3, measuredOn: '2026-05-24', weightKg: 84.8 },
          { id: 4, measuredOn: '2026-05-25', weightKg: 84.7 },
          { id: 5, measuredOn: '2026-05-26', weightKg: 84.6 },
          { id: 6, measuredOn: '2026-05-27', weightKg: 84.5 },
          { id: 7, measuredOn: '2026-05-28', weightKg: 84.4 },
        ],
      },
    })
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: /show all 7 readings/i }),
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByText('23 May 2026')).toBeVisible()
    expect(screen.getByText('22 May 2026')).toBeVisible()
  })

  it('collapses the revealed readings again when Show less is clicked', async () => {
    await renderSuspended(WeightSection, {
      props: {
        today: '2026-05-29',
        measurements: [
          { id: 1, measuredOn: '2026-05-22', weightKg: 85.0 },
          { id: 2, measuredOn: '2026-05-23', weightKg: 84.9 },
          { id: 3, measuredOn: '2026-05-24', weightKg: 84.8 },
          { id: 4, measuredOn: '2026-05-25', weightKg: 84.7 },
          { id: 5, measuredOn: '2026-05-26', weightKg: 84.6 },
          { id: 6, measuredOn: '2026-05-27', weightKg: 84.5 },
          { id: 7, measuredOn: '2026-05-28', weightKg: 84.4 },
        ],
      },
    })
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: /show all 7 readings/i }),
    )
    await user.click(screen.getByRole('button', { name: /show less/i }))

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText('22 May 2026')).toBeNull()
  })

  it('summarises the latest reading and its delta above the list', async () => {
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
