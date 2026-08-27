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

/**
 * Wipes the app-wide state between tests. Without it the setting, the in-flight
 * read and the settled flag all survive into the next test, so a pass could be a
 * previous test's leftover and the order of the file would be load-bearing.
 */
const resetHost = defineComponent({
  setup: () => {
    clearNuxtState()
    return {}
  },
  template: `<span>reset</span>`,
})

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
beforeEach(async () => {
  warn.mockClear()
  await renderSuspended(resetHost)
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

  it('joins the read already in flight rather than issuing a second', async () => {
    profileResponse = { tracksCalories: false }

    // The shape AppNav and a page make together: the nav starts the read, and a
    // page's setup awaits the settled value while that read is still in flight.
    // Driven in one setup rather than as two components, because Vue resolves
    // sibling async setups in order — mounting a nav and a page would let the
    // nav's read finish first and never exercise the overlap at all.
    const host = defineComponent({
      async setup() {
        const navLoad = useCalorieTracking().load()

        const { tracksCalories, ready } = useCalorieTracking()
        await ready()
        const seenAtSetup = tracksCalories.value

        await navLoad
        return { seenAtSetup }
      },
      template: `<span>page saw {{ seenAtSetup }}</span>`,
    })
    await renderSuspended(host)

    // The settled value, from one request — not the default, and not a second ask.
    expect(await screen.findByText('page saw false')).toBeVisible()
    expect(attempts).toBe(1)
  })

  it('asks nothing further once the setting has settled', async () => {
    profileResponse = { tracksCalories: false }

    const nav = defineComponent({
      async setup() {
        await useCalorieTracking().load()
        return {}
      },
      template: `<span>nav</span>`,
    })
    await renderSuspended(nav)
    expect(attempts).toBe(1)

    // A page reached later by an in-app navigation, when that read is long over,
    // must not re-issue it — the shell already holds the answer.
    const page = defineComponent({
      async setup() {
        const { tracksCalories, ready } = useCalorieTracking()
        await ready()
        return { seenAtSetup: tracksCalories.value }
      },
      template: `<span>page saw {{ seenAtSetup }}</span>`,
    })
    await renderSuspended(page)

    expect(await screen.findByText('page saw false')).toBeVisible()
    expect(attempts).toBe(1)
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

  it('re-asks on the next page when the read failed, rather than settling for the default', async () => {
    profileResponse = 500

    const nav = defineComponent({
      async setup() {
        await useCalorieTracking().load()
        return {}
      },
      template: `<span>nav</span>`,
    })
    await renderSuspended(nav)
    expect(attempts).toBe(1)

    // A read that failed answered nothing, so the setting is still unknown and
    // the User is holding Tucker's default shape. One transient 502 must not
    // decide that for the rest of the session — the next page asks again, and a
    // weight-only User gets the app they chose.
    profileResponse = { tracksCalories: false }
    const page = defineComponent({
      async setup() {
        const { tracksCalories, ready } = useCalorieTracking()
        await ready()
        return { seenAtSetup: tracksCalories.value }
      },
      template: `<span>page saw {{ seenAtSetup }}</span>`,
    })
    await renderSuspended(page)

    expect(attempts).toBe(2)
    expect(await screen.findByText('page saw false')).toBeVisible()
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
