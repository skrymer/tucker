import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import { intakeTargets, weeklyReview } from '~~/test/review-fixtures'
import { withCalorieTracking } from '~~/test/calorie-tracking-helpers'
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
  it.each([
    ['desktop', true],
    ['phone', false],
  ])(
    'is one Weekly reviews card on %s, its band carrying the history icon',
    async (_, desktop) => {
      viewport.desktop = desktop
      await renderSuspended(ReviewLedger, { props: { reviews: history } })

      const card = screen.getByRole('region', { name: 'Weekly reviews' })
      expect(within(card).getByText('1850')).toBeVisible()
      const heading = within(card).getByRole('heading', {
        level: 2,
        name: 'Weekly reviews',
      })
      // An aria-hidden glyph has no role or name: its icon name says which it is.
      expect(heading.querySelector('.i-lucide\\:history')).not.toBeNull()
    },
  )

  it('says what to do under its band before the first review, and runs one', async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    await renderSuspended(ReviewLedger, {
      props: { reviews: [], onRun: run },
    })

    const card = screen.getByRole('region', { name: 'Weekly reviews' })
    expect(
      within(card).getByText(/your first review will appear here/i),
    ).toBeVisible()
    expect(within(card).queryByRole('list')).not.toBeInTheDocument()
    expect(within(card).queryByRole('table')).not.toBeInTheDocument()

    await user.click(
      within(card).getByRole('button', { name: 'Run your first review' }),
    )
    expect(run).toHaveBeenCalledOnce()
  })

  it('offers to run a review now under the rows on phone, where the page header has no room for it', async () => {
    viewport.desktop = false
    const user = userEvent.setup()
    const run = vi.fn()
    await renderSuspended(ReviewLedger, {
      props: { reviews: history, onRun: run },
    })

    const card = screen.getByRole('region', { name: 'Weekly reviews' })
    await user.click(
      within(card).getByRole('button', { name: 'Run review now' }),
    )
    expect(run).toHaveBeenCalledOnce()
  })

  it('holds Run review now busy while a review is running', async () => {
    viewport.desktop = false
    await renderSuspended(ReviewLedger, {
      props: { reviews: history, running: true },
    })

    expect(
      within(screen.getByRole('region', { name: 'Weekly reviews' })).getByRole(
        'button',
        { name: 'Run review now' },
      ),
    ).toBeDisabled()
  })

  it("says under its own band that the reviews couldn't be read, and its Retry asks again", async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    await renderSuspended(ReviewLedger, {
      props: { reviews: [], error: new Error('down'), onRetry: retry },
    })

    const card = screen.getByRole('region', { name: 'Weekly reviews' })
    expect(
      within(card).getByRole('heading', { name: "Couldn't load your reviews" }),
    ).toBeVisible()
    expect(
      within(card).queryByText(/your first review will appear here/i),
    ).not.toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('holds Run your first review busy while that review is running', async () => {
    await renderSuspended(ReviewLedger, {
      props: { reviews: [], running: true },
    })

    expect(
      within(screen.getByRole('region', { name: 'Weekly reviews' })).getByRole(
        'button',
        { name: 'Run your first review' },
      ),
    ).toBeDisabled()
  })

  it('says the engine recalculates the Budget and Floor before the first review with Calorie Tracking on', async () => {
    await renderSuspended(
      withCalorieTracking(ReviewLedger, true, { reviews: [] }),
    )

    expect(
      within(screen.getByRole('region', { name: 'Weekly reviews' })).getByText(
        'No weekly reviews yet. Each week the engine recalculates your calorie budget and protein floor from your trend weight. Your first review will appear here.',
      ),
    ).toBeVisible()
  })

  it('promises no Budget before the first review with Calorie Tracking off, which keeps none', async () => {
    await renderSuspended(
      withCalorieTracking(ReviewLedger, false, { reviews: [] }),
    )

    const card = screen.getByRole('region', { name: 'Weekly reviews' })
    expect(
      within(card).getByText(
        'No weekly reviews yet. Each week the engine reads your trend weight. Your first review will appear here.',
      ),
    ).toBeVisible()
    expect(card).not.toHaveTextContent(/budget|protein floor/i)
  })

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

  it('renders the reviews as a list of rows on phone, not a table', async () => {
    viewport.desktop = false
    await renderSuspended(ReviewLedger, { props: { reviews: history } })

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const rows = screen.getByRole('list')
    expect(within(rows).getAllByRole('listitem')).toHaveLength(2)
    expect(within(rows).getByText('1850')).toBeVisible()
    expect(within(rows).getByText('Adaptive')).toBeVisible()
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
