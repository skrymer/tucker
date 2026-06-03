<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type ProfileDto = components['schemas']['ProfileDto']

// Loading and saving the Profile, grouped as one named concern.
function useProfileForm() {
  const { $api } = useNuxtApp()
  const profile = ref<ProfileDto | null>(null)

  async function load() {
    try {
      profile.value = await $api('/api/profile')
    } catch {
      // 404 → no profile yet. Leave the form empty.
      profile.value = null
    }
  }

  const { execute: save } = useApiMutation(
    (payload: { sex: string; birthDate: string; heightCm: number }) =>
      $api('/api/profile', { method: 'PUT', body: payload as ProfileDto }),
    {
      successTitle: 'Profile saved',
      errorTitle: 'Could not save profile',
      onSuccess: load,
    },
  )

  return { profile, load, save }
}

// Setting a Goal — the backend replaces the active one and preserves history.
function useGoalSubmission(onSubmitted: () => void | Promise<void>) {
  const { $api } = useNuxtApp()

  const { execute: submit } = useApiMutation(
    (payload: {
      startedOn: string
      startWeightKg: number
      targetWeightKg: number
      rateKgPerWeek: number
    }) => $api('/api/goal', { method: 'POST', body: payload }),
    {
      successTitle: 'Goal set',
      errorTitle: 'Could not set goal',
      onSuccess: onSubmitted,
    },
  )

  return { submit }
}

const { profile, load: loadProfile, save: saveProfile } = useProfileForm()

const { data: weights, refresh: refreshWeights } = await useApi('/api/weight')
const { data: goals, refresh: refreshGoals } = await useApi('/api/goals')

// The user's local date — the latest weight a backfill may target.
const today = localToday()

// The latest reading anchors the Goal form's read-only start weight.
const latestWeight = computed(() => {
  const list = weights.value ?? []
  return list.length === 0
    ? null
    : list.reduce((newest, m) =>
        m.measuredOn > newest.measuredOn ? m : newest,
      )
})

const activeGoal = computed(() => goals.value?.find((g) => g.active) ?? null)

// Progressive disclosure: each section unlocks once its prerequisite exists.
// Saving a section re-fetches the upstream state, so the next section reacts
// without a full reload.
const gating = computed(() =>
  useProfileGating(profile.value, latestWeight.value, activeGoal.value),
)

const { logWeight } = useWeightLogging({
  today,
  onSaved: refreshWeights,
  successTitle: 'Weight saved',
})
const { submit: submitGoal } = useGoalSubmission(refreshGoals)

await loadProfile()
</script>

<template>
  <section class="flex flex-col gap-8">
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold text-default">Profile</h1>
      <ProfileForm :initial="profile ?? undefined" @submit="saveProfile" />
    </div>

    <WeightSection
      :today="today"
      :measurements="weights ?? []"
      :disabled="!gating.weightEnabled"
      @logged="logWeight"
    />

    <GoalSection
      :goals="goals ?? []"
      :latest-weight="latestWeight"
      :disabled="!gating.goalEnabled"
      @submit="submitGoal"
    />
  </section>
</template>
