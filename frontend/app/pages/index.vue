<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type WeightMeasurement = components['schemas']['WeightMeasurementResponse']

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
await refreshLatestWeight()

async function onEntryLogged() {
  await refresh()
}

// The dashboard weigh-in is silent (no success toast) — the tile updating to
// the new reading is feedback enough.
const { logWeight } = useWeightLogging({ today, onSaved: refreshLatestWeight })
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-bold text-default">Today</h1>
    <SetupBanner :calorie-budget="summary?.calorieBudget" />
    <BudgetChangeBanner :budget-change="summary?.budgetChange" />
    <WeightTile :today="today" :latest="latestWeight" @logged="logWeight" />
    <DaySummary v-if="summary" :summary="summary" />
    <LogEntrySheet :date="today" @logged="onEntryLogged" />
  </section>
</template>
