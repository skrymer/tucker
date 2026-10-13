<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'
import type { Matchable } from './ReferenceFoodPicker.vue'

// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const props = defineProps<{ food: components['schemas']['FoodResponse'] }>()

const name = computed(() => formatName(props.food.name))

const { clear, unmatching } = useMatchClear(refreshFoodCatalog)

/** The Food a new match is being picked for — non-null opens the picker. */
const matching = ref<Matchable | null>(null)
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
        @click="matching = food"
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

  <ReferenceFoodPicker :food="matching" @close="matching = null" />
</template>
