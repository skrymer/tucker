import { afterEach, describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import BudgetChangeBanner from './BudgetChangeBanner.vue'

type BudgetChange = components['schemas']['BudgetChange']

const aChange = (over: Partial<BudgetChange> = {}): BudgetChange => ({
  reviewId: 7,
  previousBudgetKcal: 1850,
  newBudgetKcal: 1800,
  previousFloorG: 172,
  newFloorG: 168,
  ...over,
})

afterEach(() => {
  localStorage.clear()
})

describe('BudgetChangeBanner', () => {
  it('announces the old and new Calorie Budget and Protein Floor', async () => {
    await renderSuspended(BudgetChangeBanner, {
      props: { budgetChange: aChange() },
    })

    expect(screen.getByText(/Calorie Budget: 1850 → 1800 kcal/)).toBeVisible()
    expect(screen.getByText(/Protein Floor: 172 → 168 g/)).toBeVisible()
  })

  it('stays out of the way when nothing changed', async () => {
    await renderSuspended(BudgetChangeBanner, {
      props: { budgetChange: null },
    })

    expect(screen.queryByText(/Calorie Budget/)).not.toBeInTheDocument()
  })

  it('links through to the weekly review', async () => {
    await renderSuspended(BudgetChangeBanner, {
      props: { budgetChange: aChange() },
    })

    expect(
      screen.getByRole('link', { name: /see your review/i }),
    ).toHaveAttribute('href', '/review')
  })

  it('hides when dismissed and stays hidden after a reload', async () => {
    const user = userEvent.setup()
    await renderSuspended(BudgetChangeBanner, {
      props: { budgetChange: aChange() },
    })

    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText(/Calorie Budget/)).not.toBeInTheDocument()

    // A reload is a fresh mount; the dismissal persisted, so it stays gone.
    await renderSuspended(BudgetChangeBanner, {
      props: { budgetChange: aChange() },
    })
    expect(screen.queryByText(/Calorie Budget/)).not.toBeInTheDocument()
  })

  it('shows a fresh banner for a new changed review after an earlier one was dismissed', async () => {
    const user = userEvent.setup()
    await renderSuspended(BudgetChangeBanner, {
      props: { budgetChange: aChange({ reviewId: 7 }) },
    })
    await user.click(screen.getByRole('button', { name: /close/i }))

    // A later review (a new id) raised its own change — it isn't suppressed.
    await renderSuspended(BudgetChangeBanner, {
      props: { budgetChange: aChange({ reviewId: 8 }) },
    })
    expect(screen.getByText(/Calorie Budget/)).toBeVisible()
  })
})
