import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import LoadErrorState from './LoadErrorState.vue'

describe('LoadErrorState', () => {
  it('explains what failed and how to recover when there is an error', async () => {
    await renderSuspended(LoadErrorState, {
      props: { title: "Couldn't load your foods", error: new Error('boom') },
    })

    expect(
      screen.getByRole('heading', { name: "Couldn't load your foods" }),
    ).toBeVisible()
    expect(
      screen.getByText('Check your connection and try again.'),
    ).toBeVisible()
  })

  it('replays the failed fetch when Retry is tapped', async () => {
    const onRetry = vi.fn()
    await renderSuspended(LoadErrorState, {
      props: {
        title: "Couldn't load your foods",
        error: new Error('boom'),
        onRetry,
      },
    })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders its slot content instead when there is no error', async () => {
    await renderSuspended(LoadErrorState, {
      props: { title: "Couldn't load your foods", error: null },
      slots: { default: () => 'The real content' },
    })

    expect(screen.getByText('The real content')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: "Couldn't load your foods" }),
    ).not.toBeInTheDocument()
  })
})
