import { describe, expect, it } from 'vitest'
import { baselineProfile } from './handlers/profile'
import { bodyAndPlan } from './handlers/body'
import { server } from './node'

describe('bodyAndPlan', () => {
  it('smooths the trend as the backend does, decaying over the days between readings', async () => {
    server.use(
      ...bodyAndPlan({
        profile: baselineProfile,
        readings: [
          { id: 2, measuredOn: '2026-05-03', weightKg: 80 },
          { id: 1, measuredOn: '2026-05-01', weightKg: 90 },
        ],
      }),
    )

    const trend = await useNuxtApp().$api('/api/weight/trend')

    // 0.9² of the first reading is retained across the two-day gap.
    expect(trend).toEqual({
      trendKg: (1 - 0.9 ** 2) * 80 + 0.9 ** 2 * 90,
      asOf: '2026-05-03',
    })
  })

  it('replaces a day already weighed, keeping its id, and lists the readings oldest first', async () => {
    server.use(
      ...bodyAndPlan({
        profile: baselineProfile,
        readings: [
          { id: 7, measuredOn: '2026-05-03', weightKg: 80 },
          { id: 3, measuredOn: '2026-05-01', weightKg: 90 },
        ],
      }),
    )
    const { $api } = useNuxtApp()

    await $api('/api/weight', {
      method: 'POST',
      body: { date: '2026-05-01', weightKg: 89, clientToday: '2026-05-04' },
    })

    expect(await $api('/api/weight')).toEqual([
      { id: 3, measuredOn: '2026-05-01', weightKg: 89 },
      { id: 7, measuredOn: '2026-05-03', weightKg: 80 },
    ])
  })

  it('answers the latest reading as the newest day weighed, and none before any', async () => {
    server.use(...bodyAndPlan({ profile: baselineProfile, readings: [] }))
    const { $api } = useNuxtApp()

    const none = await $api('/api/weight/latest').catch((error) => error.data)
    await $api('/api/weight', {
      method: 'POST',
      body: { date: '2026-05-03', weightKg: 80, clientToday: '2026-05-04' },
    })
    await $api('/api/weight', {
      method: 'POST',
      body: { date: '2026-05-01', weightKg: 90, clientToday: '2026-05-04' },
    })

    expect(none).toEqual({ message: 'no weight measurements recorded yet' })
    expect(await $api('/api/weight/latest')).toEqual({
      id: 1,
      measuredOn: '2026-05-03',
      weightKg: 80,
    })
  })

  it('refuses a reading dated after the day the page says it is, keeping nothing', async () => {
    server.use(...bodyAndPlan({ profile: baselineProfile, readings: [] }))
    const { $api } = useNuxtApp()

    const refused = await $api('/api/weight', {
      method: 'POST',
      body: { date: '2026-05-05', weightKg: 89, clientToday: '2026-05-04' },
    }).catch((error) => error.data)

    expect(refused).toEqual({
      message:
        'measuredOn must not be in the future (was 2026-05-05, today is 2026-05-04)',
    })
    expect(await $api('/api/weight')).toEqual([])
  })

  it("refuses a reading stamped with any day but the test's today, standing in for a page that sent the wrong one", async () => {
    server.use(
      ...bodyAndPlan({
        profile: baselineProfile,
        readings: [],
        today: '2026-05-04',
      }),
    )
    const { $api } = useNuxtApp()

    const refused = await $api('/api/weight', {
      method: 'POST',
      body: { date: '2026-05-02', weightKg: 89, clientToday: '2026-05-03' },
    }).catch((error) => error.data)

    expect(refused).toEqual({ message: '2026-05-03 is not today' })
  })

  it('starts a Goal from the live trend, ending the active one, and lists the new one first', async () => {
    server.use(
      ...bodyAndPlan({
        profile: baselineProfile,
        readings: [{ id: 1, measuredOn: '2026-05-01', weightKg: 86 }],
        goals: [
          {
            id: 4,
            startedOn: '2026-04-01',
            startWeightKg: 90,
            targetWeightKg: 85,
            rateKgPerWeek: 0.5,
            active: true,
            reachedOn: null,
          },
        ],
      }),
    )
    const { $api } = useNuxtApp()

    await $api('/api/goal', {
      method: 'POST',
      body: {
        startedOn: '2026-05-04',
        targetWeightKg: 80,
        rateKgPerWeek: 0.7,
        clientToday: '2026-05-04',
      },
    })

    expect(await $api('/api/goals')).toEqual([
      {
        id: 5,
        startedOn: '2026-05-04',
        startWeightKg: 86,
        targetWeightKg: 80,
        rateKgPerWeek: 0.7,
        active: true,
        dailyDeficitKcal: (0.7 * 7700) / 7,
        reachedOn: null,
      },
      {
        id: 4,
        startedOn: '2026-04-01',
        startWeightKg: 90,
        targetWeightKg: 85,
        rateKgPerWeek: 0.5,
        active: false,
        dailyDeficitKcal: (0.5 * 7700) / 7,
        reachedOn: null,
      },
    ])
  })

  it('refuses a target at or above the live trend on the target field, starting nothing', async () => {
    server.use(
      ...bodyAndPlan({
        profile: baselineProfile,
        readings: [{ id: 1, measuredOn: '2026-05-01', weightKg: 86 }],
      }),
    )
    const { $api } = useNuxtApp()

    const refused = await $api('/api/goal', {
      method: 'POST',
      body: {
        startedOn: '2026-05-04',
        targetWeightKg: 86,
        rateKgPerWeek: 0.5,
        clientToday: '2026-05-04',
      },
    }).catch((error) => error.data)

    expect(refused).toEqual({
      message:
        'a weight-loss Goal needs a target below your current trend weight (86.0 kg)',
      field: 'targetWeightKg',
    })
    expect(await $api('/api/goals')).toEqual([])
  })

  it('refuses a rate whose deficit outruns the seeded Maintenance on the rate field', async () => {
    // Mifflin-St Jeor at the trend its one reading leaves, at 40:
    // (10 × 50 + 6.25 × 160 − 5 × 40 − 161) × 1.4 = 1594.6 kcal, while 1.5 kg
    // a week asks for 1650.
    server.use(
      ...bodyAndPlan({
        profile: {
          ...baselineProfile,
          sex: 'FEMALE',
          birthDate: '1986-05-22',
          heightCm: 160,
        },
        readings: [{ id: 1, measuredOn: '2026-05-28', weightKg: 50 }],
      }),
    )
    const { $api } = useNuxtApp()

    const refused = await $api('/api/goal', {
      method: 'POST',
      body: {
        startedOn: '2026-06-01',
        targetWeightKg: 45,
        rateKgPerWeek: 1.5,
        clientToday: '2026-06-01',
      },
    }).catch((error) => error.data)

    expect(refused).toEqual({
      message:
        'at your current maintenance of 1595 kcal a day, 1.5 kg a week would leave you nothing to eat — choose a slower rate',
      field: 'rateKgPerWeek',
    })
  })

  it('seeds the Maintenance a rate is judged against at the live trend on the day the page says it is', async () => {
    // No review exists to hold, so the seed is taken fresh: at 40, at the
    // trend of 51.16 kg the two readings leave, it is 1610.9 kcal — under the
    // 1650 that 1.5 kg a week asks for. At the first reading's 70 kg it
    // would be 1874.6, and the rate would pass.
    server.use(
      ...bodyAndPlan({
        profile: {
          ...baselineProfile,
          sex: 'FEMALE',
          birthDate: '1986-05-22',
          heightCm: 160,
        },
        readings: [
          { id: 1, measuredOn: '2026-05-01', weightKg: 70 },
          { id: 2, measuredOn: '2026-05-28', weightKg: 50 },
        ],
      }),
    )

    const refused = await useNuxtApp()
      .$api('/api/goal', {
        method: 'POST',
        body: {
          startedOn: '2026-06-01',
          targetWeightKg: 45,
          rateKgPerWeek: 1.5,
          clientToday: '2026-06-01',
        },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({
      message:
        'at your current maintenance of 1611 kcal a day, 1.5 kg a week would leave you nothing to eat — choose a slower rate',
      field: 'rateKgPerWeek',
    })
  })

  it('refuses a Goal before any reading, there being no trend to start it from', async () => {
    server.use(...bodyAndPlan({ profile: baselineProfile, readings: [] }))

    const refused = await useNuxtApp()
      .$api('/api/goal', {
        method: 'POST',
        body: {
          startedOn: '2026-05-04',
          targetWeightKg: 80,
          rateKgPerWeek: 0.5,
          clientToday: '2026-05-04',
        },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({
      message: 'log your weight before setting a goal',
    })
  })

  it('refuses a Goal that starts after the day the page says it is', async () => {
    server.use(
      ...bodyAndPlan({
        profile: baselineProfile,
        readings: [{ id: 1, measuredOn: '2026-05-01', weightKg: 86 }],
      }),
    )

    const refused = await useNuxtApp()
      .$api('/api/goal', {
        method: 'POST',
        body: {
          startedOn: '2026-05-05',
          targetWeightKg: 80,
          rateKgPerWeek: 0.5,
          clientToday: '2026-05-04',
        },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({
      message:
        'a Goal cannot start in the future (was 2026-05-05, today is 2026-05-04)',
    })
  })

  it('refuses a rate outside what a Goal allows, whatever Maintenance is', async () => {
    server.use(
      ...bodyAndPlan({
        profile: { ...baselineProfile, tracksCalories: false },
        readings: [{ id: 1, measuredOn: '2026-05-01', weightKg: 86 }],
      }),
    )

    const refused = await useNuxtApp()
      .$api('/api/goal', {
        method: 'POST',
        body: {
          startedOn: '2026-05-04',
          targetWeightKg: 80,
          rateKgPerWeek: 1.6,
          clientToday: '2026-05-04',
        },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({
      message: 'rateKgPerWeek must be between 0.05 and 1.5 kg/week',
    })
  })

  it('refuses a target of no weight at all, which is below any trend', async () => {
    server.use(
      ...bodyAndPlan({
        profile: baselineProfile,
        readings: [{ id: 1, measuredOn: '2026-05-01', weightKg: 86 }],
      }),
    )

    const refused = await useNuxtApp()
      .$api('/api/goal', {
        method: 'POST',
        body: {
          startedOn: '2026-05-04',
          targetWeightKg: 0,
          rateKgPerWeek: 0.5,
          clientToday: '2026-05-04',
        },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({ message: 'targetWeightKg must be > 0' })
  })

  it('refuses a reading of no weight at all', async () => {
    server.use(...bodyAndPlan({ profile: baselineProfile, readings: [] }))

    const refused = await useNuxtApp()
      .$api('/api/weight', {
        method: 'POST',
        body: { date: '2026-05-04', weightKg: 0, clientToday: '2026-05-04' },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({ message: 'weightKg must be > 0, was 0.0' })
  })

  it("refuses a Goal stamped with any day but the test's today, standing in for a page that sent the wrong one", async () => {
    server.use(
      ...bodyAndPlan({
        profile: baselineProfile,
        readings: [{ id: 1, measuredOn: '2026-05-01', weightKg: 86 }],
        today: '2026-05-04',
      }),
    )

    const refused = await useNuxtApp()
      .$api('/api/goal', {
        method: 'POST',
        body: {
          startedOn: '2026-05-03',
          targetWeightKg: 80,
          rateKgPerWeek: 0.5,
          clientToday: '2026-05-03',
        },
      })
      .catch((error) => error.data)

    expect(refused).toEqual({ message: '2026-05-03 is not today' })
  })

  it('stamps the active Goal reached on the day a reading brings the trend to its target', async () => {
    server.use(
      ...bodyAndPlan({
        profile: baselineProfile,
        readings: [{ id: 1, measuredOn: '2026-05-01', weightKg: 81 }],
        goals: [
          {
            id: 4,
            startedOn: '2026-04-01',
            startWeightKg: 90,
            targetWeightKg: 80,
            rateKgPerWeek: 0.5,
            active: true,
            reachedOn: null,
          },
        ],
      }),
    )
    const { $api } = useNuxtApp()

    // A week's decay leaves 0.9⁷ ≈ 48% of 81 kg: the trend lands under 80.
    await $api('/api/weight', {
      method: 'POST',
      body: { date: '2026-05-08', weightKg: 78, clientToday: '2026-05-08' },
    })

    const [goal] = await $api('/api/goals')
    expect(goal?.reachedOn).toBe('2026-05-08')
  })

  it('judges a rate against the Profile as last saved, which turning Calorie Tracking off removes Maintenance from', async () => {
    const profile = {
      ...baselineProfile,
      sex: 'FEMALE',
      birthDate: '1986-05-22',
      heightCm: 160,
    }
    server.use(
      ...bodyAndPlan({
        profile,
        readings: [{ id: 1, measuredOn: '2026-05-28', weightKg: 50 }],
      }),
    )
    const { $api } = useNuxtApp()

    await $api('/api/profile', {
      method: 'PUT',
      body: { ...profile, tracksCalories: false },
      query: { clientToday: '2026-06-01' },
    })
    await $api('/api/goal', {
      method: 'POST',
      body: {
        startedOn: '2026-06-01',
        targetWeightKg: 45,
        rateKgPerWeek: 1.5,
        clientToday: '2026-06-01',
      },
    })

    expect(await $api('/api/goal')).toMatchObject({
      targetWeightKg: 45,
      rateKgPerWeek: 1.5,
      active: true,
    })
  })
})
