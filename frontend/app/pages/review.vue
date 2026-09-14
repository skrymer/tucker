<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'
import type { Matchable } from '~/components/ReferenceFoodPicker.vue'

type TimelineResponse = components['schemas']['WeightTimelineResponse']
type BreakdownResponse = components['schemas']['IntakeBreakdownResponse']

const isDesktop = useIsDesktop()
const { $api } = useNuxtApp()

// Goal Progress hero sits above the ledger. 404 (no active Goal) is an expected
// state — the hero is simply omitted, as on /today's glance tile.
const {
  data: goalProgress,
  error: goalProgressError,
  load: refreshGoalProgress,
} = useOptionalFetch(() => $api('/api/goal/progress'))

/**
 * What the User's weight has done over the trailing 28 or 90 days (ADR 0029).
 * Deliberately **not** gated on Calorie Tracking the way the two sections below
 * it are: weight is the premise and intake the addition, so this degrades rather
 * than disappearing. A 404 — under a fortnight of readings, where a trend
 * understates its own movement — is an expected state, and the section is simply
 * absent.
 */
const {
  selection: timelineWindow,
  data: timeline,
  error: timelineError,
  pending: timelinePending,
  load: refreshTimeline,
} = useWindowedFetch<TimelineWindow, TimelineResponse>(28, (days, signal) =>
  $api('/api/weight-timeline', { query: trailingWindow(days), signal }),
)

// Both reads above are ungated and depend on nothing else, so they go out
// alongside the ledger rather than behind it: the await below suspends setup,
// and a section that waits on a read it does not need appears a round trip late.
const openingReads = Promise.all([refreshGoalProgress(), refreshTimeline()])

// The Weekly Review ledger: the history of the adaptive engine's recomputes,
// newest-first, plus a manual "run review now" trigger. Reuses the existing
// per-aggregate endpoints — no composite UI endpoint (ADR 0002).
const {
  data: reviews,
  error: reviewsError,
  refresh,
} = await useApi('/api/weekly-review/history')

// The Intake Breakdown over the window the User picked — the local day or the
// trailing seven days (ADR 0014, ADR 0026), both bounds inclusive. Absent — and
// unrequested — with Calorie Tracking off, gated explicitly rather than left to
// the data (ADR 0026): the setting is not a one-time choice at setup, so the
// window is not reliably empty, and the seven-day one survives a flip-off for a
// whole week.
const { tracksCalories, ready: trackingSettled } = useCalorieTracking()
const {
  selection: period,
  data: breakdown,
  error: breakdownError,
  pending: breakdownPending,
  load: refreshBreakdown,
} = useWindowedFetch<BreakdownPeriod, BreakdownResponse>(
  'today',
  // `runReview` below re-derives its day for the same reason the window is
  // derived per load rather than captured at setup.
  (chosen, signal) =>
    $api('/api/intake-breakdown', { query: breakdownWindow(chosen), signal }),
)

/**
 * How much of the week's food can say anything about its vitamins and minerals,
 * and what is left to match (ADR 0027). Its own window rather than the Intake
 * Breakdown's `week`: the backend refuses any other span, so borrowing a period
 * a User can change would make one card's toggle 400 the other's request. Gated
 * on Calorie Tracking for the breakdown's reason — it reads a log Tucker has
 * agreed to stop asking for.
 */
function useMicronutrientIntake() {
  const { data, error, pending, load } = useOptionalFetch((signal) =>
    // Derived per load rather than captured at setup, like the breakdown's
    // window: a page left open over midnight must ask about the week it is now.
    $api('/api/micronutrient-intake', {
      query: trailingWindow(MICRONUTRIENT_WINDOW_DAYS),
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
  openingReads,
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

    <LoadErrorState
      :error="timelineError"
      title="Couldn't load your weight"
      @retry="refreshTimeline"
    >
      <WeightTimelineSection
        v-if="timeline"
        v-model:window-days="timelineWindow"
        :timeline="timeline"
        :pending="timelinePending"
      />
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
