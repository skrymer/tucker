<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  measurements: components['schemas']['WeightMeasurementResponse'][]
}>()

// Newest reading first, independent of the order the API returns them in.
const ordered = computed(() =>
  [...props.measurements].sort((a, b) =>
    b.measuredOn.localeCompare(a.measuredOn),
  ),
)
</script>

<template>
  <ul role="list" class="divide-y divide-default">
    <li v-for="measurement in ordered" :key="measurement.id">
      <WeightListItem :measurement="measurement" />
    </li>
  </ul>
</template>
