import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ContentCard from './ContentCard.vue'

describe('ContentCard', () => {
  it('is a region named by its title heading', async () => {
    await renderSuspended(ContentCard, {
      props: { subject: 'weight', title: "Today's weight" },
      slots: { default: () => '72.4 kg' },
    })

    const card = screen.getByRole('region', { name: "Today's weight" })
    expect(card).toHaveTextContent('72.4 kg')
    expect(
      screen.getByRole('heading', { level: 2, name: "Today's weight" }),
    ).toBeVisible()
  })

  it("draws its subject's icon in the heading, hidden from assistive tech", async () => {
    await renderSuspended(ContentCard, {
      props: { subject: 'goal', title: 'Goal' },
    })

    // An aria-hidden glyph has no role or name to query by: its icon name is
    // the only thing that says which glyph it is.
    const heading = screen.getByRole('heading', { level: 2, name: 'Goal' })
    const icon = heading.querySelector('.i-lucide\\:target')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('carries its trailing slot in the band, outside the title', async () => {
    await renderSuspended(ContentCard, {
      props: { subject: 'today', title: 'Today · Sat 31 Oct' },
      slots: {
        trailing: () => '3 entries · 1,240 kcal',
        default: () => 'Rows',
      },
    })

    expect(screen.getByText('3 entries · 1,240 kcal')).toBeVisible()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Today · Sat 31 Oct' }),
    ).not.toHaveTextContent('entries')
  })

  it('keeps its band over a failed read, standing in the load-error row whose Retry replays it', async () => {
    const onRetry = vi.fn()
    await renderSuspended(ContentCard, {
      props: {
        subject: 'weight',
        title: "Today's weight",
        error: new Error('boom'),
        errorTitle: "Couldn't load your weight",
        onRetry,
      },
      slots: { default: () => '72.4 kg' },
    })

    const card = screen.getByRole('region', { name: "Today's weight" })
    expect(
      within(card).getByRole('heading', {
        level: 3,
        name: "Couldn't load your weight",
      }),
    ).toBeVisible()
    expect(card).not.toHaveTextContent('72.4 kg')

    await userEvent
      .setup()
      .click(within(card).getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows its band while loading, over a skeleton assistive tech is not told about', async () => {
    await renderSuspended(ContentCard, {
      props: { subject: 'goal', title: 'Goal', loading: true },
      slots: { default: () => '3.3 kg to go' },
    })

    const card = screen.getByRole('region', { name: 'Goal' })
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(card).not.toHaveTextContent('3.3 kg to go')
    // USkeleton is a live `alert`: unhidden, every row would announce itself.
    expect(within(card).queryByRole('alert')).not.toBeInTheDocument()
    expect(
      card.querySelector('[aria-hidden="true"] [role="alert"]'),
    ).not.toBeNull()
  })

  it('keeps its band over an empty read, saying what to do next in place of the body', async () => {
    await renderSuspended(ContentCard, {
      props: { subject: 'weight', title: "Today's weight", empty: true },
      slots: {
        default: () => '72.4 kg',
        empty: () => 'No weight logged today.',
      },
    })

    const card = screen.getByRole('region', { name: "Today's weight" })
    expect(within(card).getByText('No weight logged today.')).toBeVisible()
    expect(card).not.toHaveTextContent('72.4 kg')
  })
})
