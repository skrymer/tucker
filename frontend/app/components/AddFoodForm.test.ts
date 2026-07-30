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

  it('clears an untouched field when the seed no longer supplies it', async () => {
    // An untouched field's value can only have come from a seed — the user's
    // own values are, by definition, touched. So a value the current seed
    // doesn't supply belongs to a previous one, and showing it alongside the new
    // barcode is how product A gets saved under product B's code.
    const { rerender } = await renderSuspended(AddFoodForm, {
      props: {
        initial: {
          name: 'Skyr Natural',
          barcode: '5701234567890',
          proteinPer100g: 10.3,
          carbsPer100g: 4,
          fatPer100g: 0.2,
        },
      },
    })

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Skyr Natural')

    // The look-up for a different barcode fails, withdrawing the candidate.
    await rerender({ initial: { barcode: '5709999999999' } })

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('')
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue('')
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('')
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('')
  })

  it('stops clearing at a field the user has edited', async () => {
    // The withdrawal takes back what a seed put there, never what the user
    // typed — clearing that would mean deciding their words were about the old
    // product, which is the judgement ADR 0007 refuses to make.
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(AddFoodForm, {
      props: {
        initial: {
          name: 'Skyr Natural',
          barcode: '5701234567890',
          proteinPer100g: 10.3,
          carbsPer100g: 4,
          fatPer100g: 0.2,
        },
      },
    })

    await user.type(screen.getByLabelText(/^name$/i), ' (big tub)')

    await rerender({ initial: { barcode: '5709999999999' } })

    expect(screen.getByLabelText(/^name$/i)).toHaveValue(
      'Skyr Natural (big tub)',
    )
    // The macros nobody touched still go back with the seed.
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue('')
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('')
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('')
  })

  it('keeps a macro the user is still typing into when the seed is withdrawn', async () => {
    // A number field only commits its model on blur, so a macro being typed
    // into looks pristine to the merge until the user leaves it. Without the
    // keystroke marking it touched, a look-up that fails mid-entry blanks the
    // digits under the cursor — the silent data loss ADR 0007 exists to prevent.
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(AddFoodForm, {
      props: {
        initial: {
          name: 'Skyr Natural',
          barcode: '5701234567890',
          proteinPer100g: 10.3,
          carbsPer100g: 4,
          fatPer100g: 0.2,
        },
      },
    })

    // Still mid-entry: typed, never blurred.
    await user.clear(screen.getByLabelText(/protein \/100\s*g/i))
    await user.type(screen.getByLabelText(/protein \/100\s*g/i), '18')

    await rerender({ initial: { barcode: '5709999999999' } })

    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue('18')
    // The macros they never touched still go back with the seed.
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('')
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('')
  })

  it('lets a later candidate replace an earlier one', async () => {
    // Filling the form is not the user touching it. If a programmatic fill
    // marked the fields touched, the first candidate would win forever and a
    // corrected barcode could never take over.
    const { rerender } = await renderSuspended(AddFoodForm, {
      props: {
        initial: {
          name: 'Skyr Natural',
          barcode: '5701234567890',
          proteinPer100g: 10.3,
          carbsPer100g: 4,
          fatPer100g: 0.2,
        },
      },
    })

    await rerender({
      initial: {
        name: 'Peanut Butter',
        barcode: '5707777777777',
        proteinPer100g: 25,
        carbsPer100g: 12,
        fatPer100g: 50,
      },
    })

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Peanut Butter')
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue('25')
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('12')
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('50')
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
