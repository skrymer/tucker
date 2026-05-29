<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type WeightMeasurement = components['schemas']['WeightMeasurementResponse']

// The day to show — the user's local date.
const today = new Date().toLocaleDateString('en-CA')

const { $api } = useNuxtApp()
const toast = useToast()

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

const savingWeight = ref(false)
async function onWeightLogged(payload: { date: string; weightKg: number }) {
  if (savingWeight.value) return
  savingWeight.value = true
  try {
    await $api('/api/weight', { method: 'POST', body: payload })
    await refreshLatestWeight()
  } catch {
    toast.add({
      title: 'Could not save weight',
      description: 'Check your connection and try again.',
      color: 'error',
    })
  } finally {
    savingWeight.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-bold text-default">Today</h1>
    <SetupBanner :calorie-budget="summary?.calorieBudget" />
    <WeightTile
      :today="today"
      :latest="latestWeight"
      @logged="onWeightLogged"
    />
    <DaySummary v-if="summary" :summary="summary" />
    <LogEntrySheet :date="today" @logged="onEntryLogged" />
  </section>
</template>
