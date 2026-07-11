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
await refreshGoalProgress()

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
