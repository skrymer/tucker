<script setup lang="ts">
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

// The Intake Breakdown over the user's local day (ADR 0014), both bounds
// inclusive. Absent — and unrequested — with Calorie Tracking off: that User logs
// no Entries, so there is nothing to be a breakdown of (ADR 0026).
const { tracksCalories, ready: trackingSettled } = useCalorieTracking()
const {
  data: breakdown,
  error: breakdownError,
  load: refreshBreakdown,
} = useOptionalFetch(() => {
  // Read per load, not captured once at setup: a page left open over midnight
  // whose Retry is tapped at 00:03 must ask about the day it is now, not the one
  // it was when the page opened. Same reason `runReview` re-derives it below.
  const today = localToday()
  return $api('/api/intake-breakdown', { query: { from: today, to: today } })
})

// `await trackingSettled()` before reading the setting, never the bare ref: a
// *setup* reading it has no guarantee the navigation's Profile read has landed
// (AppNav.vue), and the default would ask a weight-only User's browser for a
// breakdown of a log they do not keep. It adds no request either way — on a cold
// load it joins the read already in flight beside this page's own, and on an
// in-app navigation that read has settled and it returns at once.
await trackingSettled()
await Promise.all([
  refreshGoalProgress(),
  ...(tracksCalories.value ? [refreshBreakdown()] : []),
])

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
      <IntakeBreakdownSection v-if="breakdown" :breakdown="breakdown" />
    </LoadErrorState>

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
