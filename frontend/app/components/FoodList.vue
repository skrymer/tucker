<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ foods: FoodResponse[] }>()

const emit = defineEmits<{
  log: [FoodResponse]
  delete: [FoodResponse]
  view: [FoodResponse]
  match: [FoodResponse]
}>()
</script>

<template>
  <ul role="list" class="divide-y divide-default">
    <li v-for="food in foods" :key="food.id">
      <FoodListItem
        :food="food"
        @log="(picked) => emit('log', picked)"
        @delete="(picked) => emit('delete', picked)"
        @view="(picked) => emit('view', picked)"
        @match="(picked) => emit('match', picked)"
      />
    </li>
  </ul>
</template>
