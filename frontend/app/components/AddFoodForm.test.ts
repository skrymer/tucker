import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AddFoodForm from './AddFoodForm.vue'

describe('AddFoodForm', () => {
  it('shows fields for name and the three macros, with a save button', async () => {
    await renderSuspended(AddFoodForm)

    expect(screen.getByLabelText(/^name$/i)).toBeVisible()
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toBeVisible()
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toBeVisible()
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /save food/i })).toBeVisible()
    // Calories are computed from the macros, not entered.
    expect(
      screen.queryByLabelText(/calories \/100\s*g/i),
    ).not.toBeInTheDocument()
  })

  it('prefills name and the present macros from a candidate', async () => {
    await renderSuspended(AddFoodForm, {
      props: {
        initial: {
          name: 'Skyr Natural',
          barcode: '5701234567890',
          proteinPer100g: 10.3,
          carbsPer100g: 4,
        },
      },
    })

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Skyr Natural')
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
      '10.3',
    )
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('4')
  })

  it('fills the blank fields when a candidate arrives after the form has mounted', async () => {
    // The form mounts on a manual/miss start (just a barcode), then a slow
    // look-up resolves to a candidate and the parent feeds it in.
    const { rerender } = await renderSuspended(AddFoodForm, {
      props: { initial: { barcode: '5701234567890' } },
    })

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('')
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue('')

    await rerender({
      initial: {
        name: 'Skyr Natural',
        barcode: '5701234567890',
        proteinPer100g: 10.3,
        carbsPer100g: 4,
      },
    })

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Skyr Natural')
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
      '10.3',
    )
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('4')
  })

  it('keeps a field the user has edited when a candidate arrives', async () => {
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(AddFoodForm, {
      props: { initial: { barcode: '5701234567890' } },
    })

    // The user starts typing a name while the look-up is still in flight.
    await user.type(screen.getByLabelText(/^name$/i), 'My Skyr')

    // The candidate lands with a different name and some macros.
    await rerender({
      initial: {
        name: 'Skyr Natural',
        barcode: '5701234567890',
        proteinPer100g: 10.3,
        carbsPer100g: 4,
      },
    })

    // The user's typing wins; the candidate fills only the blank fields.
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('My Skyr')
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
      '10.3',
    )
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('4')
  })

  it('shows the provider stated energy as a cross-check', async () => {
    await renderSuspended(AddFoodForm, {
      props: {
        initial: {
          name: 'Skyr Natural',
          barcode: '5701234567890',
          proteinPer100g: 10.3,
          carbsPer100g: 4,
          fatPer100g: 0.2,
        },
        statedEnergyKcalPer100g: 63,
      },
    })

    const note = screen.getByText(/63 kcal/i)
    expect(note).toBeVisible()
    // Framed as the provider's figure, with calories recalculated from macros.
    expect(note).toHaveTextContent(/stated/i)
  })

  it('omits the cross-check note when there is no stated energy', async () => {
    await renderSuspended(AddFoodForm)

    expect(screen.queryByText(/stated/i)).not.toBeInTheDocument()
  })

  it('leaves a macro the candidate lacks blank and required, blocking save', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(AddFoodForm, {
      props: {
        initial: {
          name: 'Mystery bar',
          barcode: '5709999999999',
          proteinPer100g: 8,
          carbsPer100g: 60,
          // fat absent — OFF didn't supply it.
        },
        onSubmit,
      },
    })
    const user = userEvent.setup()

    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('')

    await user.click(screen.getByRole('button', { name: /save food/i }))

    expect(screen.getByText('Enter fat per 100 g')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('emits the new-food payload when the user saves', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(AddFoodForm, { props: { onSubmit } })
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

  it('requires a name', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(AddFoodForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '10')
    await user.type(screen.getByLabelText(/carbs \/100\s*g/i), '4')
    await user.type(screen.getByLabelText(/fat \/100\s*g/i), '0.2')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    expect(screen.getByText('Enter a name for this food')).toBeVisible()
    expect(
      screen.queryByText('Enter protein per 100 g'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Enter carbs per 100 g')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter fat per 100 g')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires fat per 100 g', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(AddFoodForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/^name$/i), 'Skyr')
    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '10')
    await user.type(screen.getByLabelText(/carbs \/100\s*g/i), '4')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    expect(screen.getByText('Enter fat per 100 g')).toBeVisible()
    expect(
      screen.queryByText('Enter a name for this food'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Enter protein per 100 g'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Enter carbs per 100 g')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires carbs per 100 g', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(AddFoodForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/^name$/i), 'Skyr')
    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '10')
    await user.type(screen.getByLabelText(/fat \/100\s*g/i), '0.2')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    expect(screen.getByText('Enter carbs per 100 g')).toBeVisible()
    expect(
      screen.queryByText('Enter a name for this food'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Enter protein per 100 g'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Enter fat per 100 g')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires protein per 100 g', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(AddFoodForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/^name$/i), 'Skyr')
    await user.type(screen.getByLabelText(/carbs \/100\s*g/i), '4')
    await user.type(screen.getByLabelText(/fat \/100\s*g/i), '0.2')
    await user.click(screen.getByRole('button', { name: /save food/i }))

    expect(screen.getByText('Enter protein per 100 g')).toBeVisible()
    expect(
      screen.queryByText('Enter a name for this food'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Enter carbs per 100 g')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter fat per 100 g')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
