<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

defineProps<{
  summary: components['schemas']['DailySummaryResponse']
}>()
</script>

<template>
  <div>
    <p>
      {{ Math.round(summary.caloriesConsumed) }} / {{ summary.calorieBudget }}
      kcal
    </p>
    <p>
      {{ Math.round(summary.proteinConsumed) }} / {{ summary.proteinFloor }} g
      protein
    </p>
    <p v-if="summary.onTarget">On target</p>
  </div>
</template>
