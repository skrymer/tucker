<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  today: string
  measurements: components['schemas']['WeightMeasurementResponse'][]
}>()

const emit = defineEmits<{
  logged: [{ date: string; weightKg: number }]
}>()

const open = ref(false)

function handleSubmit(payload: { date: string; weightKg: number }) {
  open.value = false
  emit('logged', payload)
}
</script>

<template>
  <section class="flex flex-col gap-3" aria-labelledby="weight-log-heading">
    <header class="flex items-center justify-between">
      <h2 id="weight-log-heading" class="text-lg font-semibold text-default">
        Weight log
      </h2>
      <UButton icon="i-lucide-plus" color="primary" @click="open = true">
        Add weight
      </UButton>
    </header>

    <WeightList v-if="measurements.length > 0" :measurements="measurements" />
    <p v-else class="text-sm text-muted">No weight logged yet.</p>

    <!-- No `date` prop → the sheet renders its date picker for backfill. -->
    <LogWeightSheet
      v-model:open="open"
      :today="props.today"
      @submit="handleSubmit"
    />
  </section>
</template>
