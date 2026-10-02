import { describe, expect, it } from 'vitest'
import { baselineProfile, savedProfile } from './handlers/profile'
import { server, useMswServer } from './node'

useMswServer()

describe('savedProfile', () => {
  it('sets a first Profile up, completing what the save leaves out with the backend defaults', async () => {
    server.use(...savedProfile(null).handlers)
    const { $api } = useNuxtApp()

    await $api('/api/profile', {
      method: 'PUT',
      // A first save from the details form carries the body stats alone.
      body: {
        sex: 'FEMALE',
        birthDate: '1990-06-15',
        heightCm: 168,
        tracksCalories: false,
      } as never,
      query: { clientToday: '2026-05-04' },
    })

    expect(await $api('/api/profile')).toEqual({
      sex: 'FEMALE',
      birthDate: '1990-06-15',
      heightCm: 168,
      timezone: 'UTC',
      reminderHour: 9,
      remindersEnabled: false,
      tracksCalories: false,
    })
  })

  it('refuses a birth date on or after the day the save is stamped with, keeping the Profile it had', async () => {
    server.use(...savedProfile(baselineProfile).handlers)
    const { $api } = useNuxtApp()

    const refused = await $api('/api/profile', {
      method: 'PUT',
      body: { ...baselineProfile, birthDate: '2026-05-04' },
      query: { clientToday: '2026-05-04' },
    }).catch((error) => error.data)

    expect(refused).toEqual({
      message:
        'birthDate must be in the past (was 2026-05-04, today is 2026-05-04)',
    })
    expect(await $api('/api/profile')).toEqual(baselineProfile)
  })

  it('refuses a birth date more than a human lifetime before the day the save is stamped with', async () => {
    server.use(...savedProfile(baselineProfile).handlers)

    const refused = await useNuxtApp()
      .$api('/api/profile', {
        method: 'PUT',
        body: { ...baselineProfile, birthDate: '1906-05-03' },
        query: { clientToday: '2026-05-04' },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({
      message:
        'birthDate must be within the last 120 years (was 1906-05-03, today is 2026-05-04)',
    })
  })

  it('refuses a reminder hour that is not an hour of the day', async () => {
    server.use(...savedProfile(baselineProfile).handlers)

    const refused = await useNuxtApp()
      .$api('/api/profile', {
        method: 'PUT',
        body: { ...baselineProfile, reminderHour: 24 },
        query: { clientToday: '2026-05-04' },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({
      message: 'reminderHour must be in 0..23, was 24',
    })
  })

  it('refuses a height of nothing, before judging the hour', async () => {
    server.use(...savedProfile(baselineProfile).handlers)

    const refused = await useNuxtApp()
      .$api('/api/profile', {
        method: 'PUT',
        body: { ...baselineProfile, heightCm: 0, reminderHour: 24 },
        query: { clientToday: '2026-05-04' },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({ message: 'heightCm must be > 0, was 0.0' })
  })

  it('refuses a timezone that is no IANA zone', async () => {
    server.use(...savedProfile(baselineProfile).handlers)

    const refused = await useNuxtApp()
      .$api('/api/profile', {
        method: 'PUT',
        body: { ...baselineProfile, timezone: 'Mars/Olympus_Mons' },
        query: { clientToday: '2026-05-04' },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({
      message: "timezone must be a known IANA zone, was 'Mars/Olympus_Mons'",
    })
  })

  it('refuses a sex the Mifflin-St Jeor equation has no offset for, before anything else in the body', async () => {
    server.use(...savedProfile(baselineProfile).handlers)

    const refused = await useNuxtApp()
      .$api('/api/profile', {
        method: 'PUT',
        body: { ...baselineProfile, sex: 'OTHER', heightCm: 0 },
        query: { clientToday: '2026-05-04' },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({
      message: 'No enum constant com.tucker.domain.Sex.OTHER',
    })
  })

  it("refuses a save stamped with any day but the test's today, standing in for a page that sent the wrong one", async () => {
    server.use(
      ...savedProfile(baselineProfile, { today: '2026-05-04' }).handlers,
    )

    const refused = await useNuxtApp()
      .$api('/api/profile', {
        method: 'PUT',
        body: baselineProfile,
        query: { clientToday: '2026-05-03' },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({ message: '2026-05-03 is not today' })
  })

  it('refuses a save naming any zone but the one the device reports, standing in for a page that kept a stale one', async () => {
    server.use(
      ...savedProfile(baselineProfile, { timezone: 'Europe/Copenhagen' })
        .handlers,
    )

    const refused = await useNuxtApp()
      .$api('/api/profile', {
        method: 'PUT',
        body: { ...baselineProfile, timezone: 'UTC' },
        query: { clientToday: '2026-05-04' },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({
      message: 'UTC is not the zone this device reports',
    })
  })
})
