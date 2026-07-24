import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AppearanceControl from './AppearanceControl.vue'

// color-mode is an external boundary — the OS colour scheme plus its cookie. Its
// real DOM effect can't run in jsdom (the client plugin needs an inline helper
// script that only exists in the served HTML head), so we mock the boundary and
// assert the control writes the preference. The real effect — the `.dark` class
// flipping and persisting across a reload — is covered by the Playwright e2e
// (ADR 0013: the integrated test covers the wiring).
const holder = vi.hoisted(() => ({
  mode: null as { preference: string } | null,
}))
mockNuxtImport('useColorMode', () => () => {
  if (!holder.mode) holder.mode = reactive({ preference: 'system' })
  return holder.mode
})

beforeEach(() => {
  if (holder.mode) holder.mode.preference = 'system'
})

describe('AppearanceControl', () => {
  it('offers Light, Dark, and System appearance modes', async () => {
    await renderSuspended(AppearanceControl)

    expect(screen.getByRole('tab', { name: /light/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /dark/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /system/i })).toBeInTheDocument()
  })

  it('sets the appearance preference to the mode the user picks', async () => {
    await renderSuspended(AppearanceControl)

    await userEvent.click(screen.getByRole('tab', { name: /dark/i }))

    expect(holder.mode?.preference).toBe('dark')
    expect(
      screen.getByRole('tab', { name: /dark/i, selected: true }),
    ).toBeInTheDocument()
  })
})
