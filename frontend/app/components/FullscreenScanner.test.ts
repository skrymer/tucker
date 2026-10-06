import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import FullscreenScanner from './FullscreenScanner.vue'

describe('FullscreenScanner', () => {
  it('asks for a barcode, with a Stop button, while scanning', async () => {
    await renderSuspended(FullscreenScanner, { props: { state: 'scanning' } })

    const dialog = screen.getByRole('dialog', { name: 'Barcode scanner' })
    expect(
      within(dialog).getByText('Point the camera at a barcode'),
    ).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Stop' })).toBeVisible()
  })

  it('says the camera is starting while its permission is pending', async () => {
    await renderSuspended(FullscreenScanner, { props: { state: 'requesting' } })

    const dialog = screen.getByRole('dialog', { name: 'Barcode scanner' })
    expect(within(dialog).getByText('Starting the camera…')).toBeVisible()
  })

  it('stops when Stop is tapped', async () => {
    const onStop = vi.fn()
    await renderSuspended(FullscreenScanner, {
      props: { state: 'scanning', onStop },
    })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Stop' }))

    expect(onStop).toHaveBeenCalledOnce()
  })
})
