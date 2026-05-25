import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import WeighedEntryForm from './WeighedEntryForm.vue'

const sampleFoods = [
  {
    id: 1,
    name: 'Oats',
    kind: 'raw',
    caloriesPer100g: 380,
    proteinPer100g: 13,
  },
  {
    id: 2,
    name: 'Chicken breast',
    kind: 'raw',
    caloriesPer100g: 165,
    proteinPer100g: 31,
  },
]

describe('WeighedEntryForm', () => {
  it('shows the food picker, grams field, and submit button when the catalog has foods', async () => {
    await renderSuspended(WeighedEntryForm, {
      props: { date: '2026-05-25', foods: sampleFoods },
    })

    expect(screen.getByLabelText('Food')).toBeVisible()
    expect(screen.getByLabelText('Grams')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Log weighed entry' }),
    ).toBeVisible()
  })

  it('emits the entry payload when the user picks a food and logs it', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(WeighedEntryForm, {
      props: { date: '2026-05-25', foods: sampleFoods, onSubmit },
    })
    const user = userEvent.setup()

    // Open the picker and pick Oats.
    await user.click(screen.getByLabelText('Food'))
    await user.click(screen.getByRole('option', { name: 'Oats' }))

    await user.type(screen.getByLabelText('Grams'), '60')
    await user.click(screen.getByRole('button', { name: 'Log weighed entry' }))

    expect(onSubmit).toHaveBeenCalledWith({
      date: '2026-05-25',
      foodId: 1,
      grams: 60,
    })
  })

  it('requires a food to be picked', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(WeighedEntryForm, {
      props: { date: '2026-05-25', foods: sampleFoods, onSubmit },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Grams'), '60')
    await user.click(screen.getByRole('button', { name: 'Log weighed entry' }))

    expect(screen.getByText('Select a food from the list')).toBeVisible()
    expect(
      screen.queryByText('Enter the weight in grams'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Grams must be greater than 0'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires a grams figure', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(WeighedEntryForm, {
      props: { date: '2026-05-25', foods: sampleFoods, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('Food'))
    await user.click(screen.getByRole('option', { name: 'Oats' }))
    await user.click(screen.getByRole('button', { name: 'Log weighed entry' }))

    expect(screen.getByText('Enter the weight in grams')).toBeVisible()
    expect(
      screen.queryByText('Select a food from the list'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Grams must be greater than 0'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects zero or negative grams', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(WeighedEntryForm, {
      props: { date: '2026-05-25', foods: sampleFoods, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('Food'))
    await user.click(screen.getByRole('option', { name: 'Oats' }))
    await user.type(screen.getByLabelText('Grams'), '0')
    await user.click(screen.getByRole('button', { name: 'Log weighed entry' }))

    expect(screen.getByText('Grams must be greater than 0')).toBeVisible()
    expect(
      screen.queryByText('Select a food from the list'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Enter the weight in grams'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows an empty-catalog CTA when the foods catalog is empty', async () => {
    await renderSuspended(WeighedEntryForm, {
      props: { date: '2026-05-25', foods: [] },
    })

    expect(screen.queryByLabelText('Food')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Grams')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Log weighed entry' }),
    ).not.toBeInTheDocument()

    expect(screen.getByText(/no foods in your catalog/i)).toBeVisible()
    expect(
      screen.getByRole('link', { name: /add your first food/i }),
    ).toBeVisible()
  })
})
