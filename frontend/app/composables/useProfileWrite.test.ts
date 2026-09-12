import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { getQuery, readBody } from 'h3'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import { useProfileWrite } from './useProfileWrite'

type ProfileDto = components['schemas']['ProfileDto']

const SAVED: ProfileDto = {
  sex: 'MALE',
  birthDate: '1990-06-15',
  heightCm: 180,
  timezone: 'Australia/Brisbane',
  reminderHour: 9,
  remindersEnabled: false,
  tracksCalories: true,
}

let sentBody: Record<string, unknown> | undefined
let sentQuery: Record<string, unknown> | undefined
registerEndpoint('/api/profile', {
  method: 'PUT',
  handler: async (event) => {
    sentQuery = getQuery(event)
    sentBody = await readBody(event)
    return sentBody
  },
})

// Drive the composable through a minimal host so it runs in a real component
// context, the way the rest of the suite exercises composables.
const host = (patch: Partial<ProfileDto>) =>
  defineComponent({
    setup() {
      const write = useProfileWrite()
      return { save: () => write(SAVED, patch) }
    },
    template: `<button @click="save">save</button>`,
  })

beforeEach(() => {
  sentBody = undefined
  sentQuery = undefined
})

describe('useProfileWrite', () => {
  it('merges the patch onto the loaded profile, so a write never clobbers a field it did not touch', async () => {
    await renderSuspended(host({ remindersEnabled: true }))

    await userEvent.click(screen.getByRole('button', { name: 'save' }))

    await vi.waitFor(() => expect(sentBody).toBeDefined())
    expect(sentBody).toEqual({ ...SAVED, remindersEnabled: true })
  })

  it("stamps the user's local day, which the backend judges the carried-back birth date against", async () => {
    // The write replaces the whole Profile, so it sends the stored birth date
    // back untouched. Omit the day and the server's clock decides whether that
    // date is in the past, which differs from the user's for the width of a UTC
    // offset — long enough to refuse a Profile the picker in front of them allows.
    await renderSuspended(host({ heightCm: 181 }))

    await userEvent.click(screen.getByRole('button', { name: 'save' }))

    await vi.waitFor(() => expect(sentQuery).toBeDefined())
    expect(sentQuery?.clientToday).toBe(localToday())
  })
})
