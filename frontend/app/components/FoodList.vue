<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

defineProps<{ foods: FoodResponse[] }>()

const emit = defineEmits<{ log: [FoodResponse]; delete: [FoodResponse] }>()
</script>

<template>
  <ul role="list" class="divide-y divide-default">
    <li v-for="food in foods" :key="food.id">
      <FoodListItem
        :food="food"
        @log="(picked) => emit('log', picked)"
        @delete="(picked) => emit('delete', picked)"
      />
    </li>
  </ul>
</template>
