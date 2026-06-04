import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import LogItNow from './LogItNow.vue'

type FoodResponse = components['schemas']['FoodResponse']

const food: FoodResponse = {
  id: 42,
  name: 'Skyr Natural',
  kind: 'FOOD',
  caloriesPer100g: 63,
  proteinPer100g: 10.3,
  carbsPer100g: 4,
  fatPer100g: 0.2,
}

describe('LogItNow', () => {
  it('offers a grams field and a log-it-now action for the food', async () => {
    await renderSuspended(LogItNow, { props: { food, origin: 'created' } })

    expect(screen.getByLabelText(/grams/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /log it now/i })).toBeVisible()
  })

  it('emits the weighed-entry payload when grams are entered and logged', async () => {
    const onLog = vi.fn()
    await renderSuspended(LogItNow, {
      props: { food, origin: 'created', onLog },
    })
    const user = userEvent.setup()

    await user.click(screen.getByLabelText(/grams/i))
    await user.keyboard('150')
    await user.click(screen.getByRole('button', { name: /log it now/i }))

    expect(onLog).toHaveBeenCalledWith({ foodId: 42, grams: 150 })
  })

  it('never logs automatically — logging waits for the user', async () => {
    const onLog = vi.fn()
    await renderSuspended(LogItNow, {
      props: { food, origin: 'created', onLog },
    })

    expect(onLog).not.toHaveBeenCalled()
  })

  it('confirms a just-saved food and names it', async () => {
    await renderSuspended(LogItNow, { props: { food, origin: 'created' } })

    expect(screen.getByText(/saved/i)).toBeVisible()
    expect(screen.getByText('Skyr Natural')).toBeVisible()
  })

  it('leads with an already-in-catalog note for an existing food', async () => {
    await renderSuspended(LogItNow, { props: { food, origin: 'existing' } })

    expect(screen.getByText(/already in your catalog/i)).toBeVisible()
    expect(screen.getByText('Skyr Natural')).toBeVisible()
    // Not framed as a fresh save — it was already there.
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()
  })

  it('lets the user decline logging without creating an entry', async () => {
    const onLog = vi.fn()
    const onDismiss = vi.fn()
    await renderSuspended(LogItNow, {
      props: { food, origin: 'created', onLog, onDismiss },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /not now/i }))

    expect(onDismiss).toHaveBeenCalled()
    expect(onLog).not.toHaveBeenCalled()
  })
})
