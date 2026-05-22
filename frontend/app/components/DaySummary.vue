<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  summary: components['schemas']['DailySummaryResponse']
}>()

// Budget and floor are absent until the first weekly review has run.
const hasBudget = computed(() => props.summary.calorieBudget != null)
</script>

<template>
  <div>
    <template v-if="hasBudget">
      <p>
        {{ Math.round(summary.caloriesConsumed) }} / {{ summary.calorieBudget }}
        kcal
      </p>
      <p>
        {{ Math.round(summary.proteinConsumed) }} / {{ summary.proteinFloor }} g
        protein
      </p>
      <p v-if="summary.onTarget">On target</p>
      <p v-else-if="summary.onTarget === false">Off target</p>
    </template>
    <template v-else>
      <p>
        {{ Math.round(summary.caloriesConsumed) }} kcal,
        {{ Math.round(summary.proteinConsumed) }} g protein
      </p>
      <p>No budget yet — log your weight and run a weekly review.</p>
    </template>

    <ul>
      <li v-for="entry in summary.entries" :key="entry.id">
        <span>{{ entry.foodName ?? entry.label }}</span>
        <span>{{ Math.round(entry.calories) }} kcal</span>
      </li>
    </ul>
  </div>
</template>
