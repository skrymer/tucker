import { describe, expect, it, vi } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AddFoodSheet from './AddFoodSheet.vue'

// The mock router matches concrete paths only (no params), so each scenario
// registers its own barcode. A distinct barcode per outcome keeps them apart.
const CANDIDATE_BARCODE = '5701234567890'
registerEndpoint(`/api/foods/barcode/${CANDIDATE_BARCODE}`, {
  method: 'GET',
  handler: () => ({
    outcome: 'CANDIDATE',
    candidate: {
      name: 'Skyr Natural',
      barcode: CANDIDATE_BARCODE,
      proteinPer100g: 10.3,
      carbsPer100g: 4,
      fatPer100g: null,
      statedEnergyKcalPer100g: 63,
      source: 'Open Food Facts',
    },
  }),
})

const EXISTING_BARCODE = '5709999999999'
registerEndpoint(`/api/foods/barcode/${EXISTING_BARCODE}`, {
  method: 'GET',
  handler: () => ({
    outcome: 'EXISTING',
    food: {
      id: 7,
      name: 'Existing Skyr',
      kind: 'FOOD',
      barcode: EXISTING_BARCODE,
      caloriesPer100g: 63,
      proteinPer100g: 10,
      carbsPer100g: 4,
      fatPer100g: 0.2,
      cookedWeightG: null,
    },
  }),
})

describe('AddFoodSheet', () => {
  it('offers a barcode lookup alongside the manual form', async () => {
    await renderSuspended(AddFoodSheet, { props: { open: true } })

    expect(screen.getByLabelText(/barcode/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /look up/i })).toBeVisible()
    // Manual entry is an always-on peer, not gated behind the lookup.
    expect(screen.getByLabelText(/^name$/i)).toBeVisible()
  })

  it('prefills the form from a provider candidate after lookup', async () => {
    await renderSuspended(AddFoodSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), CANDIDATE_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByDisplayValue('Skyr Natural')).toBeVisible()
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
      '10.3',
    )
    // Absent macro stays blank and the stated energy shows as a cross-check.
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('')
    expect(screen.getByText(/63 kcal/i)).toBeVisible()
  })

  it('surfaces an existing catalog Food instead of the add form', async () => {
    await renderSuspended(AddFoodSheet, { props: { open: true } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), EXISTING_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText(/already in your catalog/i)).toBeVisible()
    expect(screen.getByText('Existing Skyr')).toBeVisible()
    // The add form gives way to the existing Food.
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument()
  })

  it('drops to a blank form carrying the barcode on a miss', async () => {
    // MISS_BARCODE is intentionally unregistered, so the lookup 404s.
    const MISS_BARCODE = '0000000000000'
    const onSubmit = vi.fn()
    await renderSuspended(AddFoodSheet, { props: { open: true, onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/barcode/i), MISS_BARCODE)
    await user.click(screen.getByRole('button', { name: /look up/i }))

    // Blank form — no candidate prefill — and no stated-energy note.
    await vi.waitFor(() =>
      expect(screen.getByLabelText(/^name$/i)).toHaveValue(''),
    )
    expect(screen.queryByText(/stated/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^name$/i), 'Hand typed')
    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '5')
    await user.type(screen.getByLabelText(/carbs \/100\s*g/i), '5')
    await user.type(screen.getByLabelText(/fat \/100\s*g/i), '5')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    // The typed barcode rides along to the created Food.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Hand typed', barcode: MISS_BARCODE }),
    )
  })

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
