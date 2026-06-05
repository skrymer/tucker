<script setup lang="ts">
const props = defineProps<{
  trendWeightKg: number
}>()

const trendWeight = computed(() => `${props.trendWeightKg.toFixed(1)} kg`)
</script>

<template>
  <UCard>
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-check" class="size-4 text-success" aria-hidden />
      <h2 class="text-sm font-medium text-muted">Maintaining</h2>
    </div>
    <p class="mt-1 text-4xl font-bold text-default">{{ trendWeight }}</p>
    <p class="mt-1 text-sm text-muted">Holding steady at your trend weight.</p>
  </UCard>
</template>
