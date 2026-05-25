<script setup lang="ts">
// The day to show — the user's local date.
const today = new Date().toLocaleDateString('en-CA')

const { data: summary, refresh } = await useApi('/api/summary', {
  query: { date: today },
})

async function onEntryLogged() {
  await refresh()
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-bold text-default">Today</h1>
    <DaySummary v-if="summary" :summary="summary" />
    <LogEntrySheet :date="today" @logged="onEntryLogged" />
  </section>
</template>
