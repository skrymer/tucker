<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type WeightMeasurement = components['schemas']['WeightMeasurementResponse']
type GoalProgress = components['schemas']['GoalProgressResponse']

// The day to show — the user's local date.
const today = localToday()

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
    <h1 class="text-2xl font-bold text-default">Today</h1>
    <SetupBanner :calorie-budget="summary?.calorieBudget" />
    <BudgetChangeBanner :budget-change="summary?.budgetChange" />
    <WeightTile :today="today" :latest="latestWeight" @logged="logWeight" />
    <DaySummary v-if="summary" :summary="summary" />
    <GoalGlanceTile
      v-if="goalProgress || summary?.calorieBudget != null"
      :progress="goalProgress"
    />
    <LogEntrySheet :date="today" @logged="onEntryLogged" />
  </section>
</template>
