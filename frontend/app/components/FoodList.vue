<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

defineProps<{ foods: FoodResponse[] }>()

const emit = defineEmits<{ select: [FoodResponse] }>()
</script>

<template>
  <ul role="list" class="divide-y divide-default">
    <li v-for="food in foods" :key="food.id">
      <FoodListItem :food="food" @select="(picked) => emit('select', picked)" />
    </li>
  </ul>
</template>
