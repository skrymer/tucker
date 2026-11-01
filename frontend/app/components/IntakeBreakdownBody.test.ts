import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import { intakeBreakdown } from '~~/test/intake-breakdown-fixtures'
import IntakeBreakdownBody from './IntakeBreakdownBody.vue'

describe('IntakeBreakdownBody', () => {
  it('says nothing was logged, still offering the other window, when the window holds no Entry', async () => {
    await renderSuspended(IntakeBreakdownBody, {
      props: {
        breakdown: intakeBreakdown({
          totalCalories: 0,
          loggedDays: 0,
          items: [],
        }),
      },
    })

    expect(screen.getByText('Nothing logged yet')).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Last 7 days' })).toBeVisible()
  })
})
