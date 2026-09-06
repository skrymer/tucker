import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { renderSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { food } from '~~/test/food-fixtures'
import LogGramsSheet from './LogGramsSheet.vue'

// Autofocus is desktop-only (see below), so the tests drive the viewport.
const viewport = vi.hoisted(() => ({ desktop: false }))
mockNuxtImport('useIsDesktop', () => () => ref(viewport.desktop))

const skyr = food({
  id: 1,
  name: 'Skyr',
  caloriesPer100g: 63.7,
  proteinPer100g: 11.4,
})

describe('LogGramsSheet', () => {
  // jsdom's width resolves useIsDesktop to desktop (UModal); keep that as the
  // default so the modal-only affordances (the corner close button) stay tested,
  // and opt into phone (UDrawer) explicitly where the drawer behaviour matters.
  beforeEach(() => {
    viewport.desktop = true
  })

  it('shows a sheet named for the food with a grams field when a food is set', async () => {
    await renderSuspended(LogGramsSheet, { props: { food: skyr } })

    expect(screen.getByRole('dialog', { name: 'Log Skyr' })).toBeVisible()
    expect(screen.getByLabelText(/weight \(g\)/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /log entry/i })).toBeVisible()
  })

  it('shows no sheet when no food is set', async () => {
    await renderSuspended(LogGramsSheet, { props: { food: null } })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('focuses the grams field when the sheet opens on desktop', async () => {
    viewport.desktop = true
    await renderSuspended(LogGramsSheet, { props: { food: skyr } })

    await waitFor(() =>
      expect(screen.getByLabelText(/weight \(g\)/i)).toHaveFocus(),
    )
  })

  it('does not autofocus the grams field on a phone, so its keyboard cannot trap the drawer', async () => {
    viewport.desktop = false
    await renderSuspended(LogGramsSheet, { props: { food: skyr } })

    expect(screen.getByLabelText(/weight \(g\)/i)).not.toHaveFocus()
  })

  it("emits log with the food's id and the entered grams on submit", async () => {
    const onLog = vi.fn()
    await renderSuspended(LogGramsSheet, { props: { food: skyr, onLog } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '150')
    await user.click(screen.getByRole('button', { name: /log entry/i }))

    expect(onLog).toHaveBeenCalledWith({ foodId: 1, grams: 150 })
  })

  it('logs a fraction of a gram as weighed', async () => {
    // Grams are validated as a positive number, not a whole one, so a scale
    // reading finer than the arrows' step has to survive the field.
    const onLog = vi.fn()
    await renderSuspended(LogGramsSheet, { props: { food: skyr, onLog } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '12.5')
    await user.click(screen.getByRole('button', { name: /log entry/i }))

    expect(onLog).toHaveBeenCalledWith({ foodId: 1, grams: 12.5 })
  })

  it('shows the "enter weight" message when the form is submitted empty', async () => {
    const onLog = vi.fn()
    await renderSuspended(LogGramsSheet, { props: { food: skyr, onLog } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /log entry/i }))

    expect(await screen.findByText(/enter the weight in grams/i)).toBeVisible()
    expect(screen.queryByText(/grams must be greater than 0/i)).toBeNull()
    expect(onLog).not.toHaveBeenCalled()
  })

  it('emits close when the user dismisses the sheet', async () => {
    const onClose = vi.fn()
    await renderSuspended(LogGramsSheet, { props: { food: skyr, onClose } })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalled()
  })

  it('has no separate Cancel button — the corner close is the only dismiss', async () => {
    await renderSuspended(LogGramsSheet, { props: { food: skyr } })

    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull()
  })

  it('starts blank when reopened after a previous entry was typed', async () => {
    const { rerender } = await renderSuspended(LogGramsSheet, {
      props: { food: skyr },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '150')
    // Tab first: the number field commits its model on blur, so without this
    // the state never held 150 and the assertion below proves nothing.
    await user.tab()
    await rerender({ food: null })
    await rerender({ food: skyr })

    expect(screen.getByLabelText(/weight \(g\)/i)).toHaveValue('')
  })

  it('rejects negative grams', async () => {
    const onLog = vi.fn()
    await renderSuspended(LogGramsSheet, { props: { food: skyr, onLog } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '-50')
    await user.click(screen.getByRole('button', { name: /log entry/i }))

    expect(
      await screen.findByText(/grams must be greater than 0/i),
    ).toBeVisible()
    expect(onLog).not.toHaveBeenCalled()
  })

  it('rejects zero grams', async () => {
    const onLog = vi.fn()
    await renderSuspended(LogGramsSheet, { props: { food: skyr, onLog } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '0')
    await user.click(screen.getByRole('button', { name: /log entry/i }))

    expect(
      await screen.findByText(/grams must be greater than 0/i),
    ).toBeVisible()
    expect(screen.queryByText(/enter the weight in grams/i)).toBeNull()
    expect(onLog).not.toHaveBeenCalled()
  })

  it('says how far over budget the entry would put the day, and offers to log it anyway', async () => {
    await renderSuspended(LogGramsSheet, {
      props: { food: skyr, warning: { overByKcal: 180, calorieBudget: 1900 } },
    })

    expect(screen.getByText(/~180 kcal over your 1900 budget/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Log anyway' })).toBeVisible()
    // The plain action is gone rather than sitting beside it: two submits would
    // leave the deliberate second tap ambiguous.
    expect(
      screen.queryByRole('button', { name: 'Log entry' }),
    ).not.toBeInTheDocument()
  })

  it('emits "edited" when the grams change, so a showing warning is re-checked', async () => {
    const onEdited = vi.fn()
    await renderSuspended(LogGramsSheet, {
      props: {
        food: skyr,
        warning: { overByKcal: 180, calorieBudget: 1900 },
        onEdited,
      },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/weight \(g\)/i), '90')
    await user.tab()

    expect(onEdited).toHaveBeenCalled()
  })

  it('locks the action while the projection or the save is in flight', async () => {
    await renderSuspended(LogGramsSheet, {
      props: { food: skyr, pending: true },
    })

    expect(screen.getByRole('button', { name: /log entry/i })).toBeDisabled()
  })
})
