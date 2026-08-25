<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type ProfileDto = components['schemas']['ProfileDto']
type ProfileDetails = Pick<
  ProfileDto,
  'sex' | 'birthDate' | 'heightCm' | 'tracksCalories'
>

// Loading and saving the Profile, grouped as one named concern. A 404 (no
// profile yet) is an expected empty state; any other failure is a real error
// (useOptionalFetch), surfaced in place of the details form instead of
// silently rendering as though there were simply nothing to show.
function useProfileForm() {
  const { $api } = useNuxtApp()
  const {
    data: profile,
    error,
    load: fetchProfile,
  } = useOptionalFetch(() => $api('/api/profile'))

  // The app shell shapes itself to Calorie Tracking, so the setting this form
  // just saved has to reach it — otherwise the navigation and Today only catch
  // up on the next reload. Only on a read that worked: a failed one leaves
  // `profile` null, which is indistinguishable from having none, so pushing it
  // would state a setting nobody chose. The shell then holds whatever it last
  // read until the Retry beside this form succeeds — stale in either direction,
  // but visibly so, rather than confidently wrong.
  const { readFrom } = useCalorieTracking()
  async function load() {
    await fetchProfile()
    if (!error.value) readFrom(profile.value)
  }

  const { pending: saving, execute: save } = useApiMutation(
    (payload: ProfileDetails) =>
      // Merge the body stats onto the loaded profile so saving them never
      // clobbers the user's reminder preferences (and vice-versa).
      $api('/api/profile', {
        method: 'PUT',
        body: { ...profile.value, ...payload } as ProfileDto,
        // The client owns "today" (ADR 0014): a change of Calorie Tracking
        // force-recomputes today's review, and this is the day it lands on, so
        // the Budget leaves or returns on the user's own day.
        query: { clientToday: localToday() },
      }),
    {
      // No success toast: the profile card below the form updates in place.
      errorTitle: 'Could not save profile',
      onSuccess: load,
    },
  )

  return { profile, error, load, save, saving }
}

// Setting a Goal — the backend replaces the active one and preserves history.
function useGoalSubmission(onSubmitted: () => void | Promise<void>) {
  const { $api } = useNuxtApp()

  // The start weight isn't sent — the backend anchors it on the live Trend Weight
  // at creation (ADR 0016) and re-checks the target against it; its 400 lands here
  // and feeds the form.
  const targetError = ref<string | undefined>(undefined)

  const { pending, execute } = useApiMutation(
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

  return { submit, targetError, pending }
}

const {
  profile,
  error: profileError,
  load: loadProfile,
  save: saveProfile,
  saving: savingProfile,
} = useProfileForm()

const {
  data: weights,
  error: weightsError,
  refresh: refreshWeights,
} = await useApi('/api/weight')
const {
  data: goals,
  error: goalsError,
  refresh: refreshGoals,
} = await useApi('/api/goals')

// The live Trend Weight the new Goal anchors its start on (ADR 0016). Fetched,
// never computed client-side (ADR 0002 — the EWMA is the backend's); 404 (no
// readings yet) → null, which leaves the gated Goal section disabled.
const { $api } = useNuxtApp()
const {
  data: currentTrend,
  error: currentTrendError,
  load: refreshCurrentTrend,
} = useOptionalFetch(() => $api('/api/weight/trend'))

// The Goal section depends on both reads — either failing means it can't
// render correctly, so one error state covers both and retries whichever
// (or both) failed.
const goalSectionError = computed(
  () => goalsError.value ?? currentTrendError.value,
)
function retryGoalSection() {
  return Promise.all([refreshGoals(), refreshCurrentTrend()])
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

const {
  sheetOpen: weightSheetOpen,
  saving: savingWeight,
  logWeight,
} = useWeightLogging({
  today,
  // No success toast: the new reading appears in the weight trend below. A new
  // reading also moves the Trend Weight, so refresh it for the Goal form.
  onSaved: async () => {
    await Promise.all([refreshWeights(), refreshCurrentTrend()])
  },
})
const {
  submit: submitGoal,
  targetError: goalTargetError,
  pending: savingGoal,
} = useGoalSubmission(refreshGoals)

// Profile and the trend are independent reads — load them concurrently so the
// gated page paints after one round-trip, not two.
await Promise.all([loadProfile(), refreshCurrentTrend()])
</script>

<template>
  <section class="flex flex-col gap-8">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold text-default">Profile</h1>
      <!-- Whose diet this is, and the way out — /profile only (#160). -->
      <IdentityByline />
    </div>

    <!--
      The at-a-glance state leads: the Goal, then the current Weight (its full
      history lives on /profile/weight). The body-stats form and reminder
      settings follow as the less-often-touched setup (#105).
    -->
    <LoadErrorState
      :error="goalSectionError"
      title="Couldn't load your goal"
      @retry="retryGoalSection"
    >
      <GoalSection
        :goals="goals ?? []"
        :current-trend="currentTrend"
        :target-error="goalTargetError"
        :pending="savingGoal"
        :disabled="!gating.goalEnabled"
        @submit="submitGoal"
      />
    </LoadErrorState>

    <LoadErrorState
      :error="weightsError"
      title="Couldn't load your weight"
      @retry="refreshWeights"
    >
      <WeightSection
        v-model:open="weightSheetOpen"
        :today="today"
        :measurements="weights ?? []"
        :pending="savingWeight"
        :disabled="!gating.weightEnabled"
        @logged="logWeight"
      />
    </LoadErrorState>

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
      <LoadErrorState
        :error="profileError"
        title="Couldn't load your profile"
        @retry="loadProfile"
      >
        <UCard>
          <ProfileForm
            :initial="profile ?? undefined"
            :pending="savingProfile"
            @submit="saveProfile"
          />
        </UCard>
      </LoadErrorState>
    </section>

    <!-- Reminder opt-in lives once the profile exists (it edits the profile). -->
    <ReminderSettings v-if="profile" :profile="profile" @saved="loadProfile" />

    <!-- Appearance is a per-device preference (cookie, not the Profile), so it's
         always available — never gated on body-stats setup. -->
    <section class="flex flex-col gap-4" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" class="text-lg font-semibold text-default">
        Appearance
      </h2>
      <UCard>
        <AppearanceControl />
      </UCard>
    </section>

    <!-- Renders the install affordance, or nothing once Tucker is installed. -->
    <InstallPrompt />

    <!-- Unobtrusive footer: the running build (semver + git SHA), flagging a
         frontend/backend SHA split from a partial deploy (#117). -->
    <BuildTag />
  </section>
</template>
