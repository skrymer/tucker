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
      // Merge the body stats onto the loaded profile so saving them never
      // clobbers the user's reminder preferences (and vice-versa).
      $api('/api/profile', {
        method: 'PUT',
        body: { ...profile.value, ...payload } as ProfileDto,
      }),
    {
      // No success toast: the profile card below the form updates in place.
      errorTitle: 'Could not save profile',
      onSuccess: load,
    },
  )

  return { profile, load, save }
}

// Setting a Goal — the backend replaces the active one and preserves history.
function useGoalSubmission(onSubmitted: () => void | Promise<void>) {
  const { $api } = useNuxtApp()

  // The live Trend Weight isn't on the client, so the trend-weight rule (ADR
  // 0008) is enforced by the backend; its 400 lands here and feeds the form.
  const targetError = ref<string | undefined>(undefined)

  const { execute } = useApiMutation(
    (payload: {
      startedOn: string
      startWeightKg: number
      targetWeightKg: number
      rateKgPerWeek: number
    }) =>
      // The client owns "today" (ADR 0014): send the user's local day so the
      // forced review recompute lands on it, not the server's wall-clock day.
      $api('/api/goal', {
        method: 'POST',
        body: { ...payload, clientToday: localToday() },
      }),
    {
      // No success toast: the goal card updates in place.
      errorTitle: 'Could not set goal',
      onSuccess: onSubmitted,
      onValidationError: (message) => {
        targetError.value = message
      },
    },
  )

  async function submit(payload: {
    startedOn: string
    startWeightKg: number
    targetWeightKg: number
    rateKgPerWeek: number
  }) {
    // Drop any prior rejection before re-attempting, so a corrected target that
    // now succeeds doesn't leave a stale error behind.
    targetError.value = undefined
    await execute(payload)
  }

  return { submit, targetError }
}

const { profile, load: loadProfile, save: saveProfile } = useProfileForm()

const { data: weights, refresh: refreshWeights } = await useApi('/api/weight')
const { data: goals, refresh: refreshGoals } = await useApi('/api/goals')

// The user's local date — the latest weight a backfill may target.
const today = localToday()

// The latest reading anchors the Goal form's read-only start weight.
const latestWeight = computed(
  () => sortByMeasuredOnDesc(weights.value ?? [])[0] ?? null,
)

const activeGoal = computed(() => goals.value?.find((g) => g.active) ?? null)

// Progressive disclosure: each section unlocks once its prerequisite exists.
// Saving a section re-fetches the upstream state, so the next section reacts
// without a full reload.
const gating = computed(() =>
  useProfileGating(profile.value, latestWeight.value, activeGoal.value),
)

const { logWeight } = useWeightLogging({
  today,
  // No success toast: the new reading appears in the weight trend below.
  onSaved: refreshWeights,
})
const { submit: submitGoal, targetError: goalTargetError } =
  useGoalSubmission(refreshGoals)

await loadProfile()
</script>

<template>
  <section class="flex flex-col gap-8">
    <h1 class="text-2xl font-bold text-default">Profile</h1>

    <!--
      The at-a-glance state leads: the Goal, then the current Weight (its full
      history lives on /profile/weight). The body-stats form and reminder
      settings follow as the less-often-touched setup (#105).
    -->
    <GoalSection
      :goals="goals ?? []"
      :latest-weight="latestWeight"
      :target-error="goalTargetError"
      :disabled="!gating.goalEnabled"
      @submit="submitGoal"
    />

    <WeightSection
      :today="today"
      :measurements="weights ?? []"
      :disabled="!gating.weightEnabled"
      @logged="logWeight"
    />

    <section
      class="flex flex-col gap-4"
      aria-labelledby="profile-details-heading"
    >
      <h2
        id="profile-details-heading"
        class="text-lg font-semibold text-default"
      >
        Your details
      </h2>
      <UCard>
        <ProfileForm :initial="profile ?? undefined" @submit="saveProfile" />
      </UCard>
    </section>

    <!-- Reminder opt-in lives once the profile exists (it edits the profile). -->
    <ReminderSettings v-if="profile" :profile="profile" @saved="loadProfile" />

    <!-- Renders the install affordance, or nothing once Tucker is installed. -->
    <InstallPrompt />
  </section>
</template>
