<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  measurement: components['schemas']['WeightMeasurementResponse']
}>()

// Build the Date from parts so a non-UTC test/runtime timezone can't shift the
// day off the stored ISO date.
const formattedDate = computed(() => {
  const [y, m, d] = props.measurement.measuredOn.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
})
</script>

<template>
  <div class="flex items-center justify-between gap-3 py-3">
    <p class="text-sm text-muted">{{ formattedDate }}</p>
    <p class="font-medium text-default">
      {{ measurement.weightKg.toFixed(1) }} kg
    </p>
  </div>
</template>
