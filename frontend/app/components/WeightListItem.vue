<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  measurement: components['schemas']['WeightMeasurementResponse']
}>()

const formattedDate = computed(() =>
  formatDateFromISO(props.measurement.measuredOn),
)
</script>

<template>
  <div class="flex items-center justify-between gap-3 py-3">
    <p class="text-sm text-muted">{{ formattedDate }}</p>
    <p class="font-medium text-default">
      {{ measurement.weightKg.toFixed(1) }} kg
    </p>
  </div>
</template>
