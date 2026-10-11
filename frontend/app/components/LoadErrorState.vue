<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{
  title: string
  error: unknown
  /** Inside a card under its own heading: one level down, and less padding. */
  nested?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    v-if="error"
    class="flex flex-col items-center gap-3 text-center"
    :class="nested ? 'py-6' : 'py-12'"
  >
    <UIcon name="i-lucide-cloud-off" class="size-10 text-error" aria-hidden />
    <component :is="nested ? 'h3' : 'h2'" class="text-h2 text-highlighted">
      {{ title }}
    </component>
    <p class="max-w-xs text-sm text-muted">{{ CONNECTION_ERROR_MESSAGE }}</p>
    <UButton variant="outline" color="error" size="sm" @click="emit('retry')">
      Retry
    </UButton>
  </div>
  <slot v-else />
</template>
