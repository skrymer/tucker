import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import DeleteEntryConfirm from './DeleteEntryConfirm.vue'

const banana = {
  id: 1,
  loggedOn: '2026-05-22',
  kind: 'WEIGHED',
  calories: 107,
  isEstimate: false,
  foodId: 5,
  foodName: 'Banana',
  grams: 120,
}

describe('DeleteEntryConfirm', () => {
  it('asks the user to confirm deleting the entry, named as the row reads it', async () => {
    await renderSuspended(DeleteEntryConfirm, { props: { entry: banana } })

    expect(
      screen.getByRole('dialog', { name: /delete this entry/i }),
    ).toBeVisible()
    expect(screen.getByText('Banana — 107 kcal')).toBeVisible()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeVisible()
  })

  it('confirms the deletion when the user clicks Delete', async () => {
    const onConfirm = vi.fn()
    await renderSuspended(DeleteEntryConfirm, {
      props: { entry: banana, onConfirm },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^delete$/i }))

    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('cancels the deletion when the user clicks Cancel', async () => {
    const onCancel = vi.fn()
    await renderSuspended(DeleteEntryConfirm, {
      props: { entry: banana, onCancel },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalledOnce()
  })
})
