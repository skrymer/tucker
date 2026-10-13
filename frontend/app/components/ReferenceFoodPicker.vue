<script setup lang="ts">
import type { Matchable } from './ReferenceFoodSearch.vue'

/** The Food a match is being claimed for — non-null opens the picker. */
// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
defineProps<{ food: Matchable | null }>()
const emit = defineEmits<{ close: []; changed: [] }>()
// Stryker restore all
</script>

<template>
  <ResponsiveOverlay
    :open="food !== null"
    :title="food ? `Match ${formatName(food.name)}` : ''"
    @update:open="(value) => !value && emit('close')"
  >
    <ReferenceFoodSearch
      :food="food"
      @close="emit('close')"
      @changed="emit('changed')"
    />
  </ResponsiveOverlay>
</template>
