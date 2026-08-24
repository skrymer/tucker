import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { useCalorieTracking } from './useCalorieTracking'

// What GET /api/profile answers for the test in hand: a Profile, or a status to
// fail with.
let profileResponse: { tracksCalories: boolean } | number
let attempts = 0
registerEndpoint('/api/profile', () => {
  attempts++
  if (typeof profileResponse === 'number') {
    throw createError({ statusCode: profileResponse })
  }
  return profileResponse
})

// The setting is app-wide state, so every test starts it at the opposite of the
// answer it expects — a pass can never be the previous test's leftover.
const host = (start: boolean) =>
  defineComponent({
    setup() {
      const { tracksCalories, load, readFrom } = useCalorieTracking()
      readFrom({ tracksCalories: start })
      return { tracksCalories, load }
    },
    template: `<button @click="load">load</button><span>{{ tracksCalories }}</span>`,
  })

/** A host that reads the setting without ever writing or loading it. */
const untouchedHost = defineComponent({
  setup: () => ({ tracksCalories: useCalorieTracking().tracksCalories }),
  template: `<span>{{ tracksCalories }}</span>`,
})

async function loadTracking(start: boolean) {
  await renderSuspended(host(start))
  await userEvent.click(screen.getByRole('button', { name: 'load' }))
}

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
beforeEach(() => {
  warn.mockClear()
  attempts = 0
})
afterAll(() => warn.mockRestore())

describe('useCalorieTracking', () => {
  // Leads the file on purpose: the setting is app-wide state, so this is the one
  // point at which nothing has written to it yet.
  it('counts calories for a User whose Profile has never been read', async () => {
    // Tucker's full shape is the safe direction — the alternative is removing
    // half the app from a User who chose nothing.
    await renderSuspended(untouchedHost)

    expect(await screen.findByText('true')).toBeVisible()
  })

  it('takes the setting from the signed-in User’s Profile', async () => {
    profileResponse = { tracksCalories: false }

    await loadTracking(true)

    expect(await screen.findByText('false')).toBeVisible()
  })

  it('keeps counting calories, quietly, when the User has no Profile yet', async () => {
    profileResponse = 404

    await loadTracking(false)

    expect(await screen.findByText('true')).toBeVisible()
    // Not having set up yet is an expected state, not something to log about.
    expect(warn).not.toHaveBeenCalled()
  })

  it('leaves the setting as it stands when the Profile cannot be read, and says so', async () => {
    profileResponse = 500

    await loadTracking(false)

    // Not restated from a failure: a read that should have worked says nothing
    // about what the User chose.
    expect(await screen.findByText('false')).toBeVisible()
    // And the app carrying on is not the only trace of it.
    expect(warn).toHaveBeenCalledOnce()
  })

  it('asks once, so a failure does not double the wait the shell holds paint for', async () => {
    profileResponse = 500

    await loadTracking(false)
    // Waiting on the settled value, not on the counter: `vi.waitFor` resolves on
    // its first success, so it would pass in the gap before a retry was issued.
    expect(await screen.findByText('false')).toBeVisible()

    // ofetch retries a failed GET once by default, and this read blocks the app
    // shell — a retry would buy a second round trip for an answer that falls
    // back either way (ADR 0007).
    expect(attempts).toBe(1)
  })
})
