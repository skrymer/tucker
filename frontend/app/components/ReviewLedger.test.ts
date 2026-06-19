import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import ReviewLedger from './ReviewLedger.vue'

type WeeklyReview = components['schemas']['WeeklyReviewResponse']

const viewport = vi.hoisted(() => ({ desktop: false }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

function review(overrides: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    id: 1,
    reviewedOn: '2026-06-01',
    trendWeightKg: 85,
    maintenanceKcal: 2400,
    maintenanceBasis: 'FORMULA_SEED',
    calorieBudgetKcal: 1900,
    proteinFloorG: 170,
    ...overrides,
  }
}

// History as the API returns it: oldest-first. The ledger reverses for display.
const history: WeeklyReview[] = [
  review({ id: 1, reviewedOn: '2026-06-01', calorieBudgetKcal: 1900 }),
  review({
    id: 2,
    reviewedOn: '2026-06-08',
    calorieBudgetKcal: 1850,
    maintenanceBasis: 'ADAPTIVE',
  }),
]

describe('ReviewLedger', () => {
  it('renders the reviews as a table on desktop', async () => {
    viewport.desktop = true
    await renderSuspended(ReviewLedger, { props: { reviews: history } })

    const table = screen.getByRole('table')
    expect(within(table).getByText('1850')).toBeVisible()
    expect(within(table).getByText('Adaptive')).toBeVisible()
    expect(
      within(table).getByText(/down by 50 versus the previous review/i),
    ).toBeInTheDocument()
  })

  it('renders the reviews as stacked cards on phone, not a table', async () => {
    viewport.desktop = false
    await renderSuspended(ReviewLedger, { props: { reviews: history } })

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const cards = screen.getByRole('list')
    expect(within(cards).getByText('1850')).toBeVisible()
    expect(within(cards).getByText('Adaptive')).toBeVisible()
  })
})
