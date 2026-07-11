import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import LogEntryBody from './LogEntryBody.vue'

const sampleFoods = [
  {
    id: 1,
    name: 'Oats',
    kind: 'raw',
    caloriesPer100g: 380,
    proteinPer100g: 13,
  },
]

describe('LogEntryBody', () => {
  it('offers an Estimated tab and a Weighed tab', async () => {
    await renderSuspended(LogEntryBody, {
      props: { date: '2026-05-24', foods: [] },
    })

    expect(screen.getByRole('tab', { name: 'Estimated' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Weighed' })).toBeVisible()
  })

  it('shows the Estimated entry form when the Estimated tab is active', async () => {
    await renderSuspended(LogEntryBody, {
      props: { date: '2026-05-24', foods: [] },
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
      props: {
        date: '2026-05-24',
        foods: [],
        onSubmitEstimated: submitEstimated,
      },
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

  it('shows the Weighed entry form on the Weighed tab', async () => {
    await renderSuspended(LogEntryBody, {
      props: { date: '2026-05-24', foods: sampleFoods },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('tab', { name: 'Weighed' }))

    expect(screen.getByLabelText('Food')).toBeVisible()
    expect(screen.getByLabelText('Grams')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Log weighed entry' }),
    ).toBeVisible()
  })

  it('shows a retryable error on the Weighed tab when the catalog fails to load', async () => {
    await renderSuspended(LogEntryBody, {
      props: { date: '2026-05-24', foods: [], foodsError: new Error('boom') },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('tab', { name: 'Weighed' }))

    expect(
      screen.getByRole('heading', { name: "Couldn't load your foods" }),
    ).toBeVisible()
    expect(screen.queryByLabelText('Food')).not.toBeInTheDocument()
  })
})
