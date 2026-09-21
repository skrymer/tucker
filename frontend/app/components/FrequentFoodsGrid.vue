<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ foods: FoodResponse[] }>()

const emit = defineEmits<{ pick: [FoodResponse] }>()
</script>

<template>
  <ul role="list" class="grid grid-cols-2 gap-2">
    <li v-for="food in foods" :key="food.id">
      <button
        type="button"
        :aria-label="logFoodLabel(food)"
        class="h-full w-full rounded-xl border border-default bg-default p-3 text-left transition-colors hover:border-primary active:bg-elevated"
        @click="emit('pick', food)"
      >
        <span class="flex items-start gap-1.5">
          <span class="line-clamp-2 font-medium text-default">{{
            formatName(food.name)
          }}</span>
          <UIcon
            v-if="food.kind === 'RECIPE'"
            name="i-lucide-cooking-pot"
            class="mt-0.5 size-3.5 shrink-0 text-primary"
            aria-hidden
          />
        </span>
        <span class="mt-1 block text-xs text-muted">
          {{ formatPer100g(food) }}
        </span>
      </button>
    </li>
  </ul>
</template>
