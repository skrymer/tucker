import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import LedgerFigure from './LedgerFigure.vue'

describe('LedgerFigure', () => {
  it('rounds a figure to the given decimals', async () => {
    await renderSuspended(LedgerFigure, {
      props: { value: 1849.6, delta: null, decimals: 0 },
    })

    expect(screen.getByText('1850')).toBeVisible()
  })

  it('em-dashes a figure the review does not carry', async () => {
    // A week run with Calorie Tracking off has no Budget, no Maintenance and no
    // Floor — the column stays for the weeks that do, and this row is blank.
    await renderSuspended(LedgerFigure, { props: { value: null, delta: null } })

    // One em-dash, not two stacked: with no figure there is no delta to
    // place-hold either.
    expect(screen.getAllByText('—')).toHaveLength(1)
  })

  it('shows the change alongside the figure', async () => {
    await renderSuspended(LedgerFigure, { props: { value: 1850, delta: -50 } })

    expect(
      screen.getByText(/down by 50 versus the previous review/i),
    ).toBeInTheDocument()
  })
})
