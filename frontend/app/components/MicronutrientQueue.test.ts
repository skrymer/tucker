import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { unmatchedFood } from '~~/test/micronutrient-fixtures'
import MicronutrientQueue from './MicronutrientQueue.vue'

describe('MicronutrientQueue', () => {
  it('opens onto what is left to match, each with its share, and asks to match the one tapped', async () => {
    const user = userEvent.setup()
    const match = vi.fn()
    const rice = unmatchedFood({ foodId: 2, name: 'white rice', share: 0.18 })
    await renderSuspended(MicronutrientQueue, {
      props: {
        unmatched: [unmatchedFood({ share: 0.27 }), rice],
        onMatch: match,
      },
    })

    await user.click(
      screen.getByRole('button', { name: '2 foods are not matched yet' }),
    )
    const queue = screen.getByRole('list')
    expect(within(queue).getAllByRole('listitem')).toHaveLength(2)
    expect(within(queue).getByText('27%')).toBeVisible()

    await user.click(
      within(queue).getByRole('button', { name: 'Match White rice' }),
    )
    expect(match).toHaveBeenCalledWith(rice)
  })
})
