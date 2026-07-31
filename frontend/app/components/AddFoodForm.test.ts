import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AddFoodForm from './AddFoodForm.vue'

// The corrected scan the dirty-tracking tests rerender with. It is the same
// every time, so each test differs only in what it seeded first.
const peanutButterCandidate = {
  name: 'Peanut Butter',
  barcode: '5707777777777',
  proteinPer100g: 25,
  carbsPer100g: 12,
  fatPer100g: 50,
}

// A candidate whose macros carry finer figures than the step — the decimals a
// bare tab-through used to round away.
const highPrecisionCandidate = {
  name: 'Skyr Natural',
  barcode: '5701234567890',
  proteinPer100g: 10.34,
  carbsPer100g: 8.57,
  fatPer100g: 0.23,
}

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

    await rerender({ initial: peanutButterCandidate })

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Peanut Butter')
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue('25')
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('12')
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('50')
  })

  it('saves a candidate macro at the precision the provider gave it', async () => {
    // Reaching Save by keyboard means tabbing through all three macro fields,
    // and a number field re-reads its own display on every blur — typed into or
    // not. With the step doing double duty as a quantum, that bare pass rounds
    // 8.57 to 8.6 and stores a figure no provider ever stated (ADR 0006).
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    await renderSuspended(AddFoodForm, {
      props: {
        onSubmit,
        initial: highPrecisionCandidate,
      },
    })

    await user.click(screen.getByLabelText(/protein \/100\s*g/i))
    await user.tab()
    await user.tab()
    await user.tab()

    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
      '10.34',
    )
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('8.57')
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('0.23')

    await user.click(screen.getByRole('button', { name: /save food/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Skyr Natural',
      barcode: '5701234567890',
      proteinPer100g: 10.34,
      carbsPer100g: 8.57,
      fatPer100g: 0.23,
    })
  })

  it('lets a later candidate replace a macro the user only tabbed past', async () => {
    // Passing through a field is not editing it. If a bare blur marks it
    // touched, the merge skips it for the rest of the sheet-open (ADR 0007) —
    // so scanning a corrected barcode would keep the first product's macro
    // under the second product's code.
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(AddFoodForm, {
      props: { initial: highPrecisionCandidate },
    })

    await user.click(screen.getByLabelText(/carbs \/100\s*g/i))
    await user.tab()

    await rerender({ initial: peanutButterCandidate })

    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('12')
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Peanut Butter')
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue('25')
    expect(screen.getByLabelText(/fat \/100\s*g/i)).toHaveDisplayValue('50')
  })

  it('lets a later candidate replace a macro carrying more precision than the field shows', async () => {
    // Providers publish per-100 g figures computed from a serving size, so a
    // macro can arrive with more decimals than the field can render. The field
    // hands its rounded display back on every blur; treating that as an edit
    // would freeze the field against the next barcode.
    const user = userEvent.setup()
    const { rerender } = await renderSuspended(AddFoodForm, {
      props: {
        initial: {
          name: 'Skyr Natural',
          barcode: '5701234567890',
          proteinPer100g: 8.928571428571429,
          carbsPer100g: 4,
          fatPer100g: 0.2,
        },
      },
    })

    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
      '8.929',
    )

    await user.click(screen.getByLabelText(/protein \/100\s*g/i))
    await user.tab()

    await rerender({ initial: peanutButterCandidate })

    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue('25')
  })

  it('keeps a macro the user nudged with the arrow keys', async () => {
    // Arrow keys and the +/- steppers change the value without a keystroke, so
    // they never reach the typing listener — the commit is the only place that
    // can tell they happened, and a nudged macro is just as edited as a typed
    // one.
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

    await user.click(screen.getByLabelText(/protein \/100\s*g/i))
    await user.keyboard('{ArrowUp}')
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
      '10.4',
    )

    await rerender({ initial: peanutButterCandidate })

    // The nudge wins; the untouched macros still take the new candidate.
    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue(
      '10.4',
    )
    expect(screen.getByLabelText(/carbs \/100\s*g/i)).toHaveDisplayValue('12')
  })

  it('takes a candidate that lands while the user is resting in a macro field', async () => {
    // Focus is not an edit. A look-up can resolve while the cursor sits in a
    // field the user never typed into — leaving on it must not commit the old
    // figure back over the seed that arrived underneath.
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

    await user.click(screen.getByLabelText(/protein \/100\s*g/i))

    await rerender({ initial: peanutButterCandidate })

    await user.tab()

    expect(screen.getByLabelText(/protein \/100\s*g/i)).toHaveDisplayValue('25')
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
