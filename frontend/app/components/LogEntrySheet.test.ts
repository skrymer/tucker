import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import LogEntrySheet from './LogEntrySheet.vue'

describe('LogEntrySheet', () => {
  it('renders no overlay and no trigger of its own when closed', async () => {
    await renderSuspended(LogEntrySheet, {
      props: { date: '2026-05-24', open: false },
    })

    // The page owns the trigger now (FAB / header button); the sheet is purely
    // the controlled overlay.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: /log entry/i })).toBeNull()
  })

  it('renders the entry overlay titled "Log entry" when open', async () => {
    await renderSuspended(LogEntrySheet, {
      props: { date: '2026-05-24', open: true },
    })

    const sheet = screen.getByRole('dialog', { name: /log entry/i })
    expect(sheet).toBeVisible()
    // The body hosts the tab switcher, with Estimated as the default tab.
    expect(screen.getByRole('tab', { name: 'Estimated' })).toBeVisible()
    expect(screen.getByLabelText('Label')).toBeVisible()
  })
})
