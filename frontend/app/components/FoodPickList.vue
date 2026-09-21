<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ foods: FoodResponse[] }>()

const emit = defineEmits<{ pick: [FoodResponse] }>()
</script>

<template>
  <ul role="list" class="divide-y divide-default">
    <li v-for="food in foods" :key="food.id">
      <button
        type="button"
        :aria-label="logFoodLabel(food)"
        class="w-full rounded-md py-3 text-left hover:bg-elevated active:bg-elevated"
        @click="emit('pick', food)"
      >
        <FigureRow :name="food.name" :figures="formatPer100g(food)">
          <template #marker>
            <RecipeBadge v-if="food.kind === 'RECIPE'" />
          </template>
        </FigureRow>
      </button>
    </li>
  </ul>
</template>
