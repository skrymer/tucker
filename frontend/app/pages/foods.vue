<script setup lang="ts">
const { data: foods } = await useApi('/api/foods')
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-bold text-default">Foods</h1>
    <FoodList v-if="foods && foods.length > 0" :foods="foods" />
    <FoodEmptyState v-else />
  </section>
</template>
