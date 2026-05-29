import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import WeightTile from './WeightTile.vue'

describe('WeightTile', () => {
  it('shows a Log weight CTA when no weight has been logged today', async () => {
    await renderSuspended(WeightTile, {
      props: { today: '2026-05-29', latest: null },
    })

    expect(screen.getByRole('button', { name: /log weight/i })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /edit today's weight/i }),
    ).toBeNull()
  })

  it("shows today's weight value and an edit affordance when logged today", async () => {
    await renderSuspended(WeightTile, {
      props: {
        today: '2026-05-29',
        latest: { id: 1, measuredOn: '2026-05-29', weightKg: 84.2 },
      },
    })

    expect(screen.getByText('84.2 kg')).toBeVisible()
    expect(
      screen.getByRole('button', { name: /edit today's weight/i }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /log weight/i })).toBeNull()
  })

  it('treats a latest measurement from a previous day as not-logged-today', async () => {
    await renderSuspended(WeightTile, {
      props: {
        today: '2026-05-29',
        latest: { id: 1, measuredOn: '2026-05-28', weightKg: 84.2 },
      },
    })

    expect(screen.getByRole('button', { name: /log weight/i })).toBeVisible()
    expect(screen.queryByText('84.2 kg')).toBeNull()
  })

  it("prefills the edit sheet with today's weight when reopened", async () => {
    await renderSuspended(WeightTile, {
      props: {
        today: '2026-05-29',
        latest: { id: 1, measuredOn: '2026-05-29', weightKg: 84.2 },
      },
    })
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: /edit today's weight/i }),
    )

    expect(screen.getByLabelText(/weight \(kg\)/i)).toHaveValue('84.2')
  })

  it('emits logged with the submitted payload', async () => {
    const onLogged = vi.fn()
    await renderSuspended(WeightTile, {
      props: { today: '2026-05-29', latest: null, onLogged },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /log weight/i }))
    await user.type(screen.getByLabelText(/weight \(kg\)/i), '84.2')
    await user.click(screen.getByRole('button', { name: /save weight/i }))

    expect(onLogged).toHaveBeenCalledWith({
      date: '2026-05-29',
      weightKg: 84.2,
    })
  })
})
