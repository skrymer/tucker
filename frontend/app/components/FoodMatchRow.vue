<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const props = defineProps<{ food: components['schemas']['FoodResponse'] }>()
// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const emit = defineEmits<{ change: [] }>()

const name = computed(() => formatName(props.food.name))

const { clear, unmatching } = useMatchClear(refreshFoodCatalog)
</script>

<template>
  <div
    v-if="food.referenceFoodName"
    class="flex items-center justify-between gap-3 rounded-inset bg-elevated/50 px-3 py-2"
  >
    <p class="min-w-0 text-sm text-muted">
      Vitamins and minerals from {{ food.referenceFoodName }}
    </p>
    <div class="flex shrink-0 gap-1">
      <UButton
        label="Change"
        :aria-label="`Change what ${name} borrows vitamins and minerals from`"
        color="neutral"
        variant="subtle"
        class="min-h-11"
        @click="emit('change')"
      />
      <UButton
        label="Clear"
        :aria-label="`Clear what ${name} borrows vitamins and minerals from`"
        color="neutral"
        variant="subtle"
        class="min-h-11"
        :loading="unmatching"
        @click="clear(food.id)"
      />
    </div>
  </div>
</template>
