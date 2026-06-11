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

  // The start weight isn't sent — the backend anchors it on the live Trend Weight
  // at creation (ADR 0016) and re-checks the target against it; its 400 lands here
  // and feeds the form.
  const targetError = ref<string | undefined>(undefined)

  const { execute } = useApiMutation(
    (payload: {
      startedOn: string
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

// The live Trend Weight the new Goal anchors its start on (ADR 0016). Fetched,
// never computed client-side (ADR 0002 — the EWMA is the backend's); 404 (no
// readings yet) → null, which leaves the gated Goal section disabled.
const { $api } = useNuxtApp()
const currentTrend = ref<components['schemas']['WeightTrendResponse'] | null>(
  null,
)
async function refreshCurrentTrend() {
  try {
    currentTrend.value = await $api('/api/weight/trend')
  } catch {
    currentTrend.value = null
  }
}

// The user's local date — the latest weight a backfill may target.
const today = localToday()

// The latest reading gates the Goal section (a weight must exist before a goal).
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
  // No success toast: the new reading appears in the weight trend below. A new
  // reading also moves the Trend Weight, so refresh it for the Goal form.
  onSaved: () => Promise.all([refreshWeights(), refreshCurrentTrend()]),
})
const { submit: submitGoal, targetError: goalTargetError } =
  useGoalSubmission(refreshGoals)

// Profile and the trend are independent reads — load them concurrently so the
// gated page paints after one round-trip, not two.
await Promise.all([loadProfile(), refreshCurrentTrend()])
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
      :current-trend="currentTrend"
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
