import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ReviewEmptyState from './ReviewEmptyState.vue'

describe('ReviewEmptyState', () => {
  it('explains that no review has run yet', async () => {
    await renderSuspended(ReviewEmptyState)

    expect(
      screen.getByRole('heading', { name: /no weekly reviews yet/i }),
    ).toBeVisible()
  })

  it('asks to run the first review when its button is pressed', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    await renderSuspended(ReviewEmptyState, { attrs: { onRun } })

    await user.click(
      screen.getByRole('button', { name: /run your first review/i }),
    )

    expect(onRun).toHaveBeenCalledOnce()
  })
})
