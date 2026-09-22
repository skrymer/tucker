import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import LedgerBasisBadge from './LedgerBasisBadge.vue'

// Stryker cannot instrument `withDefaults(defineProps<…>(), { … })` at all — the
// SFC compiler rejects its coverage wrapper — so this component's prop defaults
// are invisible to a mutation sweep and are pinned here by hand instead.
describe('LedgerBasisBadge', () => {
  it('badges a held review with no recorded reason as plain Held', async () => {
    // Reviews written before Tucker recorded a reason carry none, and the badge
    // falls back to the bare basis label rather than inventing a condition.
    await renderSuspended(LedgerBasisBadge, { props: { basis: 'HELD' } })

    expect(screen.getByText('Held')).toBeVisible()
  })
})
