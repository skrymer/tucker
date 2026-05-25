import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import LogEntrySheet from './LogEntrySheet.vue'

describe('LogEntrySheet', () => {
  it('renders a Log entry trigger button on the host page', async () => {
    await renderSuspended(LogEntrySheet, {
      props: { date: '2026-05-24' },
    })

    expect(screen.getByRole('button', { name: /log entry/i })).toBeVisible()
  })

  it('opens an overlay titled "Log entry" with the entry forms when the trigger is clicked', async () => {
    await renderSuspended(LogEntrySheet, {
      props: { date: '2026-05-24' },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /log entry/i }))

    const sheet = screen.getByRole('dialog', { name: /log entry/i })
    expect(sheet).toBeVisible()
    // The body hosts the tab switcher, with Estimated as the default tab.
    expect(screen.getByRole('tab', { name: 'Estimated' })).toBeVisible()
    expect(screen.getByLabelText('Label')).toBeVisible()
  })
})
