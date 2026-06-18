<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type WeightMeasurement = components['schemas']['WeightMeasurementResponse']
type GoalProgress = components['schemas']['GoalProgressResponse']

// The day to show — the user's local date.
const today = localToday()

// The Log-entry action lives on the page (header button on desktop, FAB on
// phone) so it's always reachable, matching Foods/Profile; the sheet is the
// controlled overlay it opens.
const isDesktop = useIsDesktop()
const logEntryOpen = ref(false)

const { $api } = useNuxtApp()

const { data: summary, refresh } = await useApi('/api/summary', {
  query: { date: today },
})

const latestWeight = ref<WeightMeasurement | null>(null)
async function refreshLatestWeight() {
  // 404 (no measurements yet) is an expected state, not a failure.
  try {
    latestWeight.value = await $api('/api/weight/latest')
  } catch {
    latestWeight.value = null
  }
}

// Goal progress runs off the smoothed Trend Weight, so a fresh weigh-in moves
// it; 404 (no active Goal) is an expected state, surfaced as the tile's CTA.
const goalProgress = ref<GoalProgress | null>(null)
async function refreshGoalProgress() {
  try {
    goalProgress.value = await $api('/api/goal/progress')
  } catch {
    goalProgress.value = null
  }
}

await Promise.all([refreshLatestWeight(), refreshGoalProgress()])

// Maintenance Mode (ADR 0008): no active Goal (goal/progress 404 → null) yet a
// review has produced a Trend Weight. Surfaces the calm Maintaining card with
// the Trend Weight in place of the Goal-Progress card. In a cut the Goal carries
// the trend, so this is non-null only when maintaining.
const maintainingTrendWeightKg = computed(() =>
  goalProgress.value == null ? (summary.value?.trendWeightKg ?? null) : null,
)

// Drift Status rides along on the summary in Maintenance Mode; before the first
// review supplies one it reads as gathering-data (ADR 0008).
const maintainingDriftStatus = computed<DriftStatus>(
  () => (summary.value?.driftStatus as DriftStatus) ?? 'gathering-data',
)

// Reaching a Goal (ADR 0008) latches and surfaces an insistent two-way fork:
// switch to maintenance (deactivate the Goal) or set a lower goal (on /profile).
// Switching force-lifts the Budget — the backend recomputes today's review on
// DELETE — so we refresh both the summary and the now-404 goal progress, which
// flips the page into the Maintaining card.
const { execute: switchToMaintenance } = useApiMutation(
  // Client owns "today" (ADR 0014): the recompute lifts the Budget on the user's
  // local day, not the server's wall-clock day.
  () =>
    $api('/api/goal', {
      method: 'DELETE',
      query: { clientToday: localToday() },
    }),
  {
    errorTitle: 'Could not switch to maintenance',
    onSuccess: () => Promise.all([refresh(), refreshGoalProgress()]),
  },
)

async function onEntryLogged() {
  await refresh()
}

// The dashboard weigh-in is silent (no success toast) — the tile updating to
// the new reading is feedback enough. A new reading also nudges the trend, so
// goal progress is refreshed alongside it.
async function onWeightSaved() {
  await Promise.all([refreshLatestWeight(), refreshGoalProgress()])
}
const { logWeight } = useWeightLogging({ today, onSaved: onWeightSaved })
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-default">Today</h1>
      <UButton
        v-if="isDesktop"
        icon="i-lucide-plus"
        color="primary"
        @click="logEntryOpen = true"
      >
        Log entry
      </UButton>
    </header>
    <SetupBanner :calorie-budget="summary?.calorieBudget" />
    <BudgetChangeBanner :budget-change="summary?.budgetChange" />
    <WeightTile :today="today" :latest="latestWeight" @logged="logWeight" />
    <DaySummary v-if="summary" :summary="summary" />
    <ReachedGoalBanner
      v-if="goalProgress?.reachedOn"
      :target-weight-kg="goalProgress.targetWeightKg"
      @switch-to-maintenance="switchToMaintenance"
    />
    <MaintainingTile
      v-if="maintainingTrendWeightKg != null"
      :trend-weight-kg="maintainingTrendWeightKg"
      :drift-status="maintainingDriftStatus"
    />
    <!-- The reached banner already carries the milestone; a 100% Goal-Progress
         tile beside it would be redundant, so it's suppressed while reached. -->
    <GoalGlanceTile
      v-else-if="goalProgress && !goalProgress.reachedOn"
      :progress="goalProgress"
    />
    <UButton
      v-if="!isDesktop"
      icon="i-lucide-plus"
      color="primary"
      size="xl"
      aria-label="Log entry"
      class="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] size-14 rounded-full shadow-lg"
      :ui="{ base: 'justify-center' }"
      @click="logEntryOpen = true"
    />

    <LogEntrySheet
      v-model:open="logEntryOpen"
      :date="today"
      @logged="onEntryLogged"
    />
  </section>
</template>
