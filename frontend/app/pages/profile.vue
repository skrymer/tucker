<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type ProfileDto = components['schemas']['ProfileDto']

const profile = ref<ProfileDto | null>(null)
const saving = ref(false)
const { $api } = useNuxtApp()
const toast = useToast()

// The user's local date — the latest weight a backfill may target.
const today = new Date().toLocaleDateString('en-CA')

async function loadProfile() {
  try {
    profile.value = await $api('/api/profile')
  } catch {
    // 404 → no profile yet. Leave form empty.
    profile.value = null
  }
}

const { data: weights, refresh: refreshWeights } = await useApi('/api/weight')
const { data: goals, refresh: refreshGoals } = await useApi('/api/goals')

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

await loadProfile()

async function handleSubmit(payload: {
  sex: string
  birthDate: string
  heightCm: number
}) {
  if (saving.value) return
  saving.value = true
  try {
    await $api('/api/profile', { method: 'PUT', body: payload as ProfileDto })
    await loadProfile()
    toast.add({ title: 'Profile saved', color: 'success' })
  } catch {
    toast.add({
      title: 'Could not save profile',
      description: 'Check your connection and try again.',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

const savingWeight = ref(false)
async function handleWeightLogged(payload: { date: string; weightKg: number }) {
  if (savingWeight.value) return
  savingWeight.value = true
  try {
    // Send the user's local date so the backend validates against it, not its
    // own (UTC) date, which can lag a day behind across midnight (#24).
    await $api('/api/weight', {
      method: 'POST',
      body: { ...payload, clientToday: today },
    })
    await refreshWeights()
    toast.add({ title: 'Weight saved', color: 'success' })
  } catch {
    toast.add({
      title: 'Could not save weight',
      description: 'Check your connection and try again.',
      color: 'error',
    })
  } finally {
    savingWeight.value = false
  }
}

const savingGoal = ref(false)
async function handleGoalSubmit(payload: {
  startedOn: string
  startWeightKg: number
  targetWeightKg: number
  rateKgPerWeek: number
}) {
  if (savingGoal.value) return
  savingGoal.value = true
  try {
    await $api('/api/goal', { method: 'POST', body: payload })
    await refreshGoals()
    toast.add({ title: 'Goal set', color: 'success' })
  } catch {
    toast.add({
      title: 'Could not set goal',
      description: 'Check your connection and try again.',
      color: 'error',
    })
  } finally {
    savingGoal.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-8">
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold text-default">Profile</h1>
      <ProfileForm :initial="profile ?? undefined" @submit="handleSubmit" />
    </div>

    <WeightSection
      :today="today"
      :measurements="weights ?? []"
      :disabled="!gating.weightEnabled"
      @logged="handleWeightLogged"
    />

    <GoalSection
      :goals="goals ?? []"
      :latest-weight="latestWeight"
      :disabled="!gating.goalEnabled"
      @submit="handleGoalSubmit"
    />
  </section>
</template>
