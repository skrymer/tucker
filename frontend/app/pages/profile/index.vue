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

  // The day this write stamps is also what a change of Calorie Tracking
  // force-recomputes today's review on, so the Budget leaves or returns on the
  // user's own day.
  const write = useProfileWrite()

  const { pending: saving, execute: save } = useApiMutation(
    (payload: ProfileDetails) => write(profile.value, payload),
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
  // (ADR 0016) and re-checks the target against it; that 400 names targetWeightKg
  // and feeds the form.
  // The rate has a rule of its own that only the backend can apply, since only it
  // holds Maintenance (ADR 0030), so the refusal is routed by the field it names
  // rather than assumed to be about the target.
  const refusal = ref<GoalRefusal>({})

  const { pending, execute } = useApiMutation(
    (payload: GoalPayload) =>
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
      onValidationError: (message, field) => {
        refusal.value = refusalFor(message, field)
      },
    },
  )

  async function submit(payload: GoalPayload) {
    // Drop any prior rejection before re-attempting, so a corrected input that
    // now succeeds doesn't leave a stale error behind — all of it, since a
    // resubmit may fix one field and be refused on another.
    refusal.value = {}
    await execute(payload)
  }

  return { submit, refusal, pending }
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

// The live Trend Weight, which a Goal anchors its start on (ADR 0016). Fetched,
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
  () => goalsError.value ?? currentTrendError.value ?? weightsError.value,
)
function retryGoalSection() {
  return Promise.all([refreshGoals(), refreshCurrentTrend(), refreshWeights()])
}

// The Goal section unlocks once a Profile and a weight reading exist; saving
// re-fetches the upstream state, so it reacts without a full reload.
const goalEnabled = computed(
  () => profile.value !== null && (weights.value?.length ?? 0) > 0,
)

const {
  submit: submitGoal,
  refusal: goalRefusal,
  pending: savingGoal,
} = useGoalSubmission(refreshGoals)

// Profile and the trend are independent reads — load them concurrently so the
// gated page paints after one round-trip, not two.
await Promise.all([loadProfile(), refreshCurrentTrend()])
</script>

<template>
  <section class="flex flex-col gap-8">
    <div class="flex flex-col gap-1">
      <h1 class="text-h1 text-default">Profile</h1>
      <!-- Whose diet this is, and the way out — /profile only (#160). -->
      <IdentityByline />
    </div>

    <!--
      The at-a-glance state leads: the Goal. The body-stats form and reminder
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
        :refusal="goalRefusal"
        :pending="savingGoal"
        :disabled="!goalEnabled"
        @submit="submitGoal"
      />
    </LoadErrorState>

    <section
      class="flex flex-col gap-4"
      aria-labelledby="profile-details-heading"
    >
      <h2 id="profile-details-heading" class="text-h2 text-highlighted">
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
      <h2 id="appearance-heading" class="text-h2 text-highlighted">
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
