import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import GoalErrorCard from './GoalErrorCard.vue'

describe('GoalErrorCard', () => {
  it("says the Goal couldn't be read under the Goal's band, and its Retry asks again", async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    await renderSuspended(GoalErrorCard, {
      props: { error: new Error('down'), onRetry: retry },
    })

    const card = screen.getByRole('region', { name: 'Goal' })
    expect(
      within(card).getByRole('heading', { name: "Couldn't load your goal" }),
    ).toBeVisible()

    await user.click(within(card).getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
