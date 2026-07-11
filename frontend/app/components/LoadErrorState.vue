<script setup lang="ts">
defineProps<{ title: string; error: unknown }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="error" class="flex flex-col items-center gap-3 py-12 text-center">
    <UIcon name="i-lucide-cloud-off" class="size-10 text-error" aria-hidden />
    <h2 class="text-lg font-semibold text-default">{{ title }}</h2>
    <p class="max-w-xs text-sm text-muted">{{ CONNECTION_ERROR_MESSAGE }}</p>
    <UButton variant="outline" color="error" size="sm" @click="emit('retry')">
      Retry
    </UButton>
  </div>
  <slot v-else />
</template>
