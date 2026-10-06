import { describe, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import type { components } from '#open-fetch-schemas/api'
import { savedProfile } from '~~/test/mocks/handlers/profile'
import { server } from '~~/test/mocks/node'
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

// Drive the composable through a minimal host so it runs in a real component
// context, the way the rest of the suite exercises composables. After the
// write it reads the Profile back, as a page does, and prints what it holds.
const host = (patch: Partial<ProfileDto>) =>
  defineComponent({
    setup() {
      const { $api } = useNuxtApp()
      const write = useProfileWrite()
      const stored = ref<ProfileDto | null>(null)
      async function save() {
        await write(SAVED, patch)
        stored.value = await $api('/api/profile')
      }
      return { save, stored }
    },
    template: `<button @click="save">save</button>
      <ul v-if="stored"><li v-for="(value, field) in stored" :key="field">{{ field }}: {{ value }}</li></ul>`,
  })

describe('useProfileWrite', () => {
  it('merges the patch onto the loaded profile, so a write never clobbers a field it did not touch', async () => {
    server.use(...savedProfile(SAVED).handlers)
    await renderSuspended(host({ remindersEnabled: true }))

    await userEvent.click(screen.getByRole('button', { name: 'save' }))

    const fields = await screen.findAllByRole('listitem')
    expect(fields.map((field) => field.textContent)).toEqual([
      'sex: MALE',
      'birthDate: 1990-06-15',
      'heightCm: 180',
      'timezone: Australia/Brisbane',
      'reminderHour: 9',
      'remindersEnabled: true',
      'tracksCalories: true',
    ])
  })

  it("stamps the user's local day, which the backend judges the carried-back birth date against", async () => {
    // The write replaces the whole Profile, so it sends the stored birth date
    // back untouched. Omit the day and the server's clock decides whether that
    // date is in the past, which differs from the user's for the width of a UTC
    // offset — long enough to refuse a Profile the picker in front of them allows.
    server.use(...savedProfile(SAVED, { today: localToday() }).handlers)
    await renderSuspended(host({ heightCm: 181 }))

    await userEvent.click(screen.getByRole('button', { name: 'save' }))

    expect(await screen.findByText('heightCm: 181')).toBeVisible()
  })
})
