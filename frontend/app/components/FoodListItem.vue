<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

defineProps<{ food: FoodResponse }>()
</script>

<template>
  <div class="flex items-start justify-between gap-3 py-3">
    <div class="min-w-0">
      <p class="truncate font-medium text-default">{{ food.name }}</p>
      <p class="mt-0.5 text-sm text-muted">
        {{ Math.round(food.caloriesPer100g) }} kcal ·
        {{ Math.round(food.proteinPer100g) }} g protein /100g
      </p>
    </div>
  </div>
</template>
