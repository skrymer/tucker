<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ foods: FoodResponse[] }>()

const emit = defineEmits<{ pick: [FoodResponse] }>()

/**
 * The cell's accessible name. A Recipe is marked in the *name*, not only by the
 * pot icon beside it: the icon is nothing at all to a screen reader, and this
 * grid is a phone's whole logging surface.
 */
function labelFor(food: FoodResponse): string {
  return food.kind === 'RECIPE'
    ? `Log ${food.name}, a recipe`
    : `Log ${food.name}`
}
</script>

<template>
  <ul role="list" class="grid grid-cols-2 gap-2">
    <li v-for="food in foods" :key="food.id">
      <button
        type="button"
        :aria-label="labelFor(food)"
        class="h-full w-full rounded-xl border border-default bg-default p-3 text-left transition-colors hover:border-primary active:bg-elevated"
        @click="emit('pick', food)"
      >
        <span class="flex items-start gap-1.5">
          <span class="line-clamp-2 font-medium text-default">{{
            food.name
          }}</span>
          <UIcon
            v-if="food.kind === 'RECIPE'"
            name="i-lucide-cooking-pot"
            class="mt-0.5 size-3.5 shrink-0 text-primary"
            aria-hidden
          />
        </span>
        <span class="mt-1 block text-xs text-muted">
          {{ Math.round(food.caloriesPer100g) }} kcal ·
          {{ Math.round(food.proteinPer100g) }} g protein /100g
        </span>
      </button>
    </li>
  </ul>
</template>
