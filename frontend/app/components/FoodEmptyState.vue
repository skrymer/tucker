<script setup lang="ts">
const emit = defineEmits<{ add: [] }>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-12 text-center">
    <UIcon name="i-lucide-salad" class="size-10 text-muted" aria-hidden />
    <h2 class="text-lg font-semibold text-default">Build your food catalog</h2>
    <p class="max-w-xs text-sm text-muted">
      Add the foods you eat regularly so logging takes a tap.
    </p>
    <UButton variant="outline" size="sm" @click="emit('add')">
      Add your first food
    </UButton>
  </div>
</template>
