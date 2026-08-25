import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import { intakeTargets, weeklyReview } from '~~/test/review-fixtures'
import ReviewLedger from './ReviewLedger.vue'

type WeeklyReview = components['schemas']['WeeklyReviewResponse']

// The four the calorie columns bring, and the full set a mixed history earns.
const CALORIE_HEADERS = ['Basis', 'Budget', 'Maintenance', 'Protein floor']
const LEDGER_HEADERS = ['Reviewed', 'Trend wt.', ...CALORIE_HEADERS]

const viewport = vi.hoisted(() => ({ desktop: false }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

// History as the API returns it: oldest-first. The ledger reverses for display.
const history: WeeklyReview[] = [
  weeklyReview({
    id: 1,
    reviewedOn: '2026-06-01',
    intakeTargets: intakeTargets({
      maintenanceBasis: 'FORMULA_SEED',
      calorieBudgetKcal: 1900,
    }),
  }),
  weeklyReview({
    id: 2,
    reviewedOn: '2026-06-08',
    intakeTargets: intakeTargets({
      maintenanceBasis: 'ADAPTIVE',
      calorieBudgetKcal: 1850,
    }),
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

  it('keeps the calorie columns for a history where only some reviews carry targets', async () => {
    viewport.desktop = true
    await renderSuspended(ReviewLedger, {
      props: {
        reviews: [
          weeklyReview({
            id: 1,
            reviewedOn: '2026-06-01',
            intakeTargets: null,
          }),
          history[1]!,
        ],
      },
    })

    // Turning Calorie Tracking off must not erase a real Budget from view, so the
    // columns stay and the weight-only week is em-dashed instead.
    const table = screen.getByRole('table')
    for (const header of LEDGER_HEADERS) {
      expect(within(table).getByText(header)).toBeVisible()
    }
    expect(within(table).getByText('1850')).toBeVisible()
    // One basis badge, for the one week that has a Maintenance: a basis rendered
    // against a target-less row would be labelling a derivation that never happened.
    // (The em-dash standing in for its calorie cells is a presentation token,
    // unasserted for the reason `ReviewDelta`'s placeholder is.)
    expect(within(table).getAllByText('Adaptive')).toHaveLength(1)
  })

  it('drops the calorie columns for a history with no targets at all', async () => {
    viewport.desktop = true
    await renderSuspended(ReviewLedger, {
      props: {
        reviews: [
          weeklyReview({
            id: 1,
            reviewedOn: '2026-06-01',
            trendWeightKg: 85,
            intakeTargets: null,
          }),
          weeklyReview({
            id: 2,
            reviewedOn: '2026-06-08',
            trendWeightKg: 84,
            intakeTargets: null,
          }),
        ],
      },
    })

    // A User who has never counted calories gets a dated Trend Weight, not four
    // columns of em-dashes.
    const table = screen.getByRole('table')
    expect(within(table).getByText('Reviewed')).toBeVisible()
    expect(within(table).getByText('Trend wt.')).toBeVisible()
    expect(within(table).getByText('84.0')).toBeVisible()
    expect(within(table).getByText('85.0')).toBeVisible()
    for (const header of CALORIE_HEADERS) {
      expect(within(table).queryByText(header)).not.toBeInTheDocument()
    }
  })
})
