import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import DeleteFoodConfirm from './DeleteFoodConfirm.vue'

const oats = {
  id: 7,
  name: 'Oats',
  kind: 'raw',
  caloriesPer100g: 380,
  proteinPer100g: 13,
}

describe('DeleteFoodConfirm', () => {
  it('asks the user to confirm deleting the named food', async () => {
    await renderSuspended(DeleteFoodConfirm, { props: { food: oats } })

    expect(
      screen.getByRole('dialog', { name: /delete this food/i }),
    ).toBeVisible()
    expect(screen.getByText(/Oats/)).toBeVisible()
    expect(screen.getByRole('button', { name: /delete/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeVisible()
  })

  it('warns that a food with logged entries cannot be deleted', async () => {
    await renderSuspended(DeleteFoodConfirm, { props: { food: oats } })

    expect(screen.getByText(/logged entries.*can't be deleted/i)).toBeVisible()
    // The old copy promised deletion always works ("entries keep their
    // numbers") — it contradicts the rule and must be gone.
    expect(screen.queryByText(/keep their numbers/i)).toBeNull()
  })

  it('warns that a food used as a recipe ingredient cannot be deleted', async () => {
    await renderSuspended(DeleteFoodConfirm, { props: { food: oats } })

    expect(
      screen.getByText(/recipe ingredient.*can't be deleted/i),
    ).toBeVisible()
  })

  it('confirms the deletion when the user clicks Delete', async () => {
    const onConfirm = vi.fn()
    await renderSuspended(DeleteFoodConfirm, {
      props: { food: oats, onConfirm },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^delete$/i }))

    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('cancels the deletion when the user clicks Cancel', async () => {
    const onCancel = vi.fn()
    await renderSuspended(DeleteFoodConfirm, {
      props: { food: oats, onCancel },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalledOnce()
  })
})
