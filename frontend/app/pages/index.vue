<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

// The day to show — the user's local date.
const today = localToday()

// The Log-entry action lives on the page (header button on desktop, FAB on
// phone) so it's always reachable, matching Foods/Profile; the sheet is the
// controlled overlay it opens.
const isDesktop = useIsDesktop()
const logEntryOpen = ref(false)

const { $api } = useNuxtApp()

const {
  data: summary,
  error: summaryError,
  refresh,
} = await useApi('/api/summary', {
  query: { date: today },
})

// 404 (no measurements yet) is an expected state, not a failure.
const {
  data: latestWeight,
  error: latestWeightError,
  load: refreshLatestWeight,
} = useOptionalFetch(() => $api('/api/weight/latest'))

// Goal progress runs off the smoothed Trend Weight, so a fresh weigh-in moves
// it; 404 (no active Goal) is an expected state, surfaced as the tile's CTA.
const {
  data: goalProgress,
  error: goalProgressError,
  load: refreshGoalProgress,
} = useOptionalFetch(() => $api('/api/goal/progress'))

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

// Delete a mislogged Entry (issue #113) — today's only, so it never rewrites
// intake a Weekly Review has already counted. A tapped trash icon selects the
// row; confirming removes it and refreshes the day, whose totals/dayStatus then
// re-derive without it. No success toast (ADR 0005): the vanishing row is the
// feedback.
const selectedEntry = ref<EntryResponse | null>(null)

const { execute: deleteEntry } = useApiMutation(
  (entry: EntryResponse) =>
    $api('/api/entries/{id}', { method: 'DELETE', path: { id: entry.id } }),
  {
    errorTitle: 'Could not delete entry',
    onSuccess: () => {
      selectedEntry.value = null
      return refresh()
    },
  },
)

function confirmDeleteEntry() {
  const entry = selectedEntry.value
  if (entry) deleteEntry(entry)
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
    <LoadErrorState
      :error="summaryError"
      title="Couldn't load today's summary"
      @retry="refresh"
    >
      <SetupBanner :calorie-budget="summary?.calorieBudget" />
      <BudgetChangeBanner :budget-change="summary?.budgetChange" />
      <LoadErrorState
        :error="latestWeightError"
        title="Couldn't load your weight"
        @retry="refreshLatestWeight"
      >
        <WeightTile :today="today" :latest="latestWeight" @logged="logWeight" />
      </LoadErrorState>
      <DaySummary
        v-if="summary"
        :summary="summary"
        @delete="selectedEntry = $event"
      />
      <LoadErrorState
        :error="goalProgressError"
        title="Couldn't load your goal"
        @retry="refreshGoalProgress"
      >
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
        <!-- The reached banner already carries the milestone; a 100%
             Goal-Progress tile beside it would be redundant, so it's
             suppressed while reached. -->
        <GoalGlanceTile
          v-else-if="goalProgress && !goalProgress.reachedOn"
          :progress="goalProgress"
        />
      </LoadErrorState>
    </LoadErrorState>
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

    <DeleteEntryConfirm
      :entry="selectedEntry"
      @cancel="selectedEntry = null"
      @confirm="confirmDeleteEntry"
    />
  </section>
</template>
