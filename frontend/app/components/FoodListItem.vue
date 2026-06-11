<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const props = defineProps<{ food: FoodResponse }>()
const emit = defineEmits<{ log: [FoodResponse]; delete: [FoodResponse] }>()
</script>

<template>
  <!-- Two sibling controls (nested buttons are invalid HTML): the row body
       logs the food, the trailing icon deletes it. -->
  <div class="flex items-center gap-1">
    <button
      type="button"
      :aria-label="`Log ${food.name}`"
      class="min-w-0 flex-1 rounded-md py-3 text-left hover:bg-elevated active:bg-elevated"
      @click="emit('log', props.food)"
    >
      <div class="min-w-0">
        <p class="truncate font-medium text-default">{{ food.name }}</p>
        <p class="mt-0.5 text-sm text-muted">
          {{ Math.round(food.caloriesPer100g) }} kcal ·
          {{ Math.round(food.proteinPer100g) }} g protein /100g
        </p>
      </div>
    </button>

    <UButton
      :aria-label="`Delete ${food.name}`"
      icon="i-lucide-trash-2"
      color="neutral"
      variant="ghost"
      square
      class="size-11 shrink-0 text-muted hover:text-default"
      :ui="{ base: 'justify-center' }"
      @click="emit('delete', props.food)"
    />
  </div>
</template>
