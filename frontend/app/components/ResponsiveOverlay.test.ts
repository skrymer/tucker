import { describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ResponsiveOverlay from './ResponsiveOverlay.vue'

const viewport = vi.hoisted(() => ({ desktop: false }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

async function renderOverlay(props: { open: boolean }) {
  await renderSuspended(ResponsiveOverlay, {
    props: { title: 'Log weight', ...props },
    slots: { default: () => 'Weight form goes here' },
  })
}

describe('ResponsiveOverlay', () => {
  it('shows the title and slotted content when open on a phone', async () => {
    viewport.desktop = false
    await renderOverlay({ open: true })

    expect(screen.getByText('Log weight')).toBeVisible()
    expect(screen.getByText('Weight form goes here')).toBeVisible()
  })

  it('shows the same title and content when open on desktop', async () => {
    viewport.desktop = true
    await renderOverlay({ open: true })

    expect(screen.getByText('Log weight')).toBeVisible()
    expect(screen.getByText('Weight form goes here')).toBeVisible()
  })

  it('renders no content when closed', async () => {
    viewport.desktop = false
    await renderOverlay({ open: false })

    expect(screen.queryByText('Weight form goes here')).not.toBeInTheDocument()
  })

  it('puts a leading control in the header before the title, outside the heading', async () => {
    viewport.desktop = false
    await renderSuspended(ResponsiveOverlay, {
      props: { title: 'Match Tasty cheese', open: true },
      slots: {
        leading: () => h('button', { type: 'button' }, 'Back'),
        default: () => 'Search goes here',
      },
    })

    // The heading names the sheet; Back is a control beside it, not part of it.
    const sheet = screen.getByRole('dialog', { name: 'Match Tasty cheese' })
    const heading = within(sheet).getByRole('heading', {
      name: 'Match Tasty cheese',
    })
    const back = within(sheet).getByRole('button', { name: 'Back' })
    expect(
      back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: /close/i })).toBeVisible()
    expect(within(sheet).getByText('Search goes here')).toBeVisible()
  })

  it('still closes from its corner when the header carries a leading control', async () => {
    viewport.desktop = false
    const onUpdateOpen = vi.fn()
    await renderSuspended(ResponsiveOverlay, {
      props: {
        title: 'Match Tasty cheese',
        open: true,
        'onUpdate:open': onUpdateOpen,
      },
      slots: {
        leading: () => h('button', { type: 'button' }, 'Back'),
        default: () => 'Search goes here',
      },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /close/i }))

    expect(onUpdateOpen).toHaveBeenCalledWith(false)
  })

  it('keeps the corner close in every state — the sheet only exit', async () => {
    // Escape and the backdrop are refused, and no sheet here carries a Cancel,
    // so this is the universal out (ADR 0017). Nothing bounds a request, so
    // taking it away while one is in flight would trap the User behind it.
    viewport.desktop = true
    await renderOverlay({ open: true })

    expect(screen.getByRole('button', { name: /close/i })).toBeVisible()
  })
})
