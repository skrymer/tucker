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
        <span class="flex min-w-0 items-center gap-2">
          <span class="truncate font-medium text-default">{{ food.name }}</span>
          <UBadge
            v-if="food.kind === 'RECIPE'"
            color="primary"
            variant="subtle"
            size="sm"
            class="shrink-0"
          >
            <UIcon name="i-lucide-cooking-pot" class="size-3" />
            Recipe
          </UBadge>
        </span>
        <span class="mt-0.5 block text-sm text-muted">
          {{ formatPer100g(food) }}
        </span>
      </button>
    </li>
  </ul>
</template>
