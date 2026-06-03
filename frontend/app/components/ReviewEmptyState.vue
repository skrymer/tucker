<script setup lang="ts">
const emit = defineEmits<{ run: [] }>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-12 text-center">
    <UIcon name="i-lucide-line-chart" class="size-10 text-muted" aria-hidden />
    <h2 class="text-lg font-semibold text-default">No weekly reviews yet</h2>
    <p class="max-w-xs text-sm text-muted">
      Each week the engine recalculates your calorie budget and protein floor
      from your weight trend. Your first review will appear here.
    </p>
    <UButton
      variant="outline"
      size="sm"
      icon="i-lucide-refresh-cw"
      @click="emit('run')"
    >
      Run your first review
    </UButton>
  </div>
</template>
