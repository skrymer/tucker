<script setup lang="ts">
const { data: weights } = await useApi('/api/weight')
const measurements = computed(() => weights.value ?? [])
</script>

<template>
  <section class="flex flex-col gap-4">
    <UButton
      to="/profile"
      icon="i-lucide-arrow-left"
      variant="ghost"
      color="neutral"
      class="self-start"
    >
      Back to profile
    </UButton>

    <h1 class="text-2xl font-bold text-default">Weight history</h1>
    <WeightList v-if="measurements.length" :measurements="measurements" />
    <p v-else class="text-sm text-muted">No weight logged yet.</p>
  </section>
</template>
