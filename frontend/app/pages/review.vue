<script setup lang="ts">
// The Weekly Review ledger: the history of the adaptive engine's recomputes,
// newest-first, plus a manual "run review now" trigger. Reuses the existing
// per-aggregate endpoints — no composite UI endpoint (ADR 0002).
const { data: reviews, refresh } = await useApi('/api/weekly-review/history')

const isDesktop = useIsDesktop()
const { $api } = useNuxtApp()

const hasReviews = computed(() => (reviews.value?.length ?? 0) > 0)

const { pending, execute: runReview } = useApiMutation(
  () => $api('/api/weekly-review', { method: 'POST' }),
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
  </section>
</template>
