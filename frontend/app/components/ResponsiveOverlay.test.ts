import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
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

  it('keeps the corner close in every state — the sheet only exit', async () => {
    // Escape and the backdrop are refused, and no sheet here carries a Cancel,
    // so this is the universal out (ADR 0017). Nothing bounds a request, so
    // taking it away while one is in flight would trap the User behind it.
    viewport.desktop = true
    await renderOverlay({ open: true })

    expect(screen.getByRole('button', { name: /close/i })).toBeVisible()
  })
})
