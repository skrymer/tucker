<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

// A row's listeners reach it straight from the page: FoodListItem declares them,
// and a list relaying each one would only restate its contract.
// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
defineOptions({ inheritAttrs: false })
withDefaults(
  defineProps<{
    foods: components['schemas']['FoodResponse'][]
    tracksCalories?: boolean
  }>(),
  { tracksCalories: true },
)
// Stryker restore all
</script>

<template>
  <ul role="list" class="divide-y divide-default">
    <li v-for="food in foods" :key="food.id">
      <FoodListItem
        :food="food"
        :tracks-calories="tracksCalories"
        v-bind="$attrs"
      />
    </li>
  </ul>
</template>
