<script setup lang="ts">
import type { Matchable } from '~/components/ReferenceFoodPicker.vue'

// The Weekly Review ledger: the history of the adaptive engine's recomputes,
// newest-first, plus a manual "run review now" trigger. Reuses the existing
// per-aggregate endpoints — no composite UI endpoint (ADR 0002).
const {
  data: reviews,
  error: reviewsError,
  refresh,
} = await useApi('/api/weekly-review/history')

const isDesktop = useIsDesktop()
const { $api } = useNuxtApp()

// Goal Progress hero sits above the ledger. 404 (no active Goal) is an expected
// state — the hero is simply omitted, as on /today's glance tile.
const {
  data: goalProgress,
  error: goalProgressError,
  load: refreshGoalProgress,
} = useOptionalFetch(() => $api('/api/goal/progress'))

// The Intake Breakdown over the window the User picked — the local day or the
// trailing seven days (ADR 0014, ADR 0026), both bounds inclusive. Absent — and
// unrequested — with Calorie Tracking off, gated explicitly rather than left to
// the data (ADR 0026): the setting is not a one-time choice at setup, so the
// window is not reliably empty, and the seven-day one survives a flip-off for a
// whole week.
const { tracksCalories, ready: trackingSettled } = useCalorieTracking()
function useIntakeBreakdown() {
  const period = ref<BreakdownPeriod>('today')
  const { data, error, pending, load } = useOptionalFetch(
    (signal) =>
      // Derived per load, not captured once at setup: a page left open over
      // midnight whose Retry is tapped at 00:03 must ask about the day it is
      // now, not the one it was when the page opened. Same reason `runReview`
      // re-derives it below.
      $api('/api/intake-breakdown', {
        query: breakdownWindow(period.value),
        signal,
      }),
    // `latest`, not the default `guard`: each call asks about a different
    // window, so a load issued while one is in flight is a new question rather
    // than a repeat of the one being answered, and dropping it would leave the
    // section describing the window the User has just left.
    { mode: 'latest' },
  )

  watch(period, load)
  return { period, breakdown: data, error, pending, load }
}
const {
  period,
  breakdown,
  error: breakdownError,
  pending: breakdownPending,
  load: refreshBreakdown,
} = useIntakeBreakdown()

/**
 * How much of the week's food can say anything about its vitamins and minerals,
 * and what is left to match (ADR 0027). The trailing seven days and nothing else
 * — there is no other window in scope — and gated on Calorie Tracking for the
 * breakdown's reason: it reads a log Tucker has agreed to stop asking for.
 */
function useMicronutrientIntake() {
  const { data, error, pending, load } = useOptionalFetch((signal) =>
    // Derived per load rather than captured at setup, like the breakdown's
    // window: a page left open over midnight must ask about the week it is now.
    $api('/api/micronutrient-intake', {
      query: breakdownWindow('week'),
      signal,
    }),
  )
  return { intake: data, error, pending, load }
}
const {
  intake: micronutrients,
  error: micronutrientsError,
  pending: micronutrientsPending,
  load: refreshMicronutrients,
} = useMicronutrientIntake()

// `await trackingSettled()` before reading the setting, never the bare ref: a
// *setup* reading it has no guarantee the navigation's Profile read has landed
// (AppNav.vue), and the default would ask a weight-only User's browser for a
// breakdown of a log they do not keep. It adds no request either way — on a cold
// load it joins the read already in flight beside this page's own, and on an
// in-app navigation that read has settled and it returns at once.
await trackingSettled()
await Promise.all([
  refreshGoalProgress(),
  ...(tracksCalories.value
    ? [refreshBreakdown(), refreshMicronutrients()]
    : []),
])

/**
 * The Food whose borrow is being claimed — non-null opens the picker. The queue
 * is the one way in (ADR 0027), so what arrives here is always unmatched and
 * carries no borrow to take back.
 */
const foodToMatch = ref<Matchable | null>(null)
const {
  claim: claimMatch,
  clear: clearMatch,
  matching,
  unmatching,
} = useReferenceFoodMatch(foodToMatch, refreshMicronutrients)

const hasReviews = computed(() => (reviews.value?.length ?? 0) > 0)

const { pending, execute: runReview } = useApiMutation(
  // Client owns "today" (ADR 0014): stamp the manual review on the user's local
  // day, not the server's wall-clock day.
  () =>
    $api('/api/weekly-review', {
      method: 'POST',
      query: { clientToday: localToday() },
    }),
  {
    // No success toast: the fresh review appears at the top of the ledger.
    errorTitle: 'Could not run the review',
    onSuccess: () => refresh(),
  },
)
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-default">Review</h1>
      <UButton
        v-if="isDesktop && hasReviews"
        icon="i-lucide-refresh-cw"
        color="primary"
        :loading="pending"
        :disabled="pending"
        @click="runReview()"
      >
        Run review now
      </UButton>
    </header>

    <LoadErrorState
      :error="goalProgressError"
      title="Couldn't load your goal"
      @retry="refreshGoalProgress"
    >
      <GoalProgressHero v-if="goalProgress" :progress="goalProgress" />
    </LoadErrorState>

    <!-- One gate, in setup: with Calorie Tracking off nothing was fetched, so
         there is neither a breakdown to render nor an error to report. -->
    <LoadErrorState
      :error="breakdownError"
      title="Couldn't load what you're eating"
      @retry="refreshBreakdown"
    >
      <IntakeBreakdownSection
        v-if="breakdown"
        v-model:period="period"
        :breakdown="breakdown"
        :pending="breakdownPending"
      />
    </LoadErrorState>

    <!-- Between the breakdown and the ledger, and gated in setup by the same
         rule: with Calorie Tracking off nothing was fetched, so there is neither
         an intake to render nor an error to report. -->
    <LoadErrorState
      :error="micronutrientsError"
      title="Couldn't load your vitamins and minerals"
      @retry="refreshMicronutrients"
    >
      <MicronutrientSection
        v-if="micronutrients"
        :intake="micronutrients"
        :pending="micronutrientsPending"
        @match="foodToMatch = { id: $event.foodId, name: $event.name }"
      />
    </LoadErrorState>

    <ReferenceFoodPicker
      :food="foodToMatch"
      :matching="matching"
      :unmatching="unmatching"
      @match="claimMatch"
      @unmatch="clearMatch"
      @close="foodToMatch = null"
    />

    <LoadErrorState
      :error="reviewsError"
      title="Couldn't load your reviews"
      @retry="refresh"
    >
      <template v-if="hasReviews">
        <ReviewLedger :reviews="reviews ?? []" />
        <UButton
          v-if="!isDesktop"
          icon="i-lucide-refresh-cw"
          color="primary"
          block
          size="lg"
          :loading="pending"
          :disabled="pending"
          @click="runReview()"
        >
          Run review now
        </UButton>
      </template>
      <ReviewEmptyState v-else @run="runReview()" />
    </LoadErrorState>
  </section>
</template>
