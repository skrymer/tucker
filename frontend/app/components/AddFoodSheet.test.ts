import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AddFoodSheet from './AddFoodSheet.vue'

describe('AddFoodSheet', () => {
  it('shows the add-food form when open', async () => {
    await renderSuspended(AddFoodSheet, { props: { open: true } })

    expect(screen.getByRole('dialog', { name: /add food/i })).toBeVisible()
    expect(screen.getByLabelText(/^name$/i)).toBeVisible()
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toBeVisible()
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toBeVisible()
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toBeVisible()
  })

  it('emits the new-food payload when the user saves', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(AddFoodSheet, {
      props: { open: true, onSubmit },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/^name$/i), 'Skyr')
    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '10')
    await user.type(screen.getByLabelText(/carbs \/100\s*g/i), '4')
    await user.type(screen.getByLabelText(/fat \/100\s*g/i), '0.2')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Skyr',
      proteinPer100g: 10,
      carbsPer100g: 4,
      fatPer100g: 0.2,
    })
  })
})
