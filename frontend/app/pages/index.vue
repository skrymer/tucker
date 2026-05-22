<script setup lang="ts">
// The day to show — the user's local date.
const today = new Date().toLocaleDateString('en-CA')

const { data: summary } = await useApi('/api/summary', {
  query: { date: today },
})
</script>

<template>
  <section>
    <h1 class="text-2xl font-bold text-default">Today</h1>
    <DaySummary v-if="summary" :summary="summary" />
  </section>
</template>
