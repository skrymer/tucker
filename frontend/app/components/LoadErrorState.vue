<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{
  title: string
  error: unknown
  /**
   * Inside a card under its own heading: one compact row, heading a level
   * down, in the footprint of the content it stands in for.
   */
  nested?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <template v-if="error">
    <div
      v-if="nested"
      class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-1"
    >
      <div class="flex min-w-0 items-start gap-2">
        <UIcon
          name="i-lucide-cloud-off"
          class="mt-0.5 size-5 shrink-0 text-error"
          aria-hidden
        />
        <div class="min-w-0">
          <h3 class="text-label text-highlighted">{{ title }}</h3>
          <p class="text-sm text-muted">{{ CONNECTION_ERROR_MESSAGE }}</p>
        </div>
      </div>
      <UButton
        variant="outline"
        color="error"
        size="sm"
        class="shrink-0"
        @click="emit('retry')"
      >
        Retry
      </UButton>
    </div>
    <div v-else class="flex flex-col items-center gap-3 py-12 text-center">
      <UIcon name="i-lucide-cloud-off" class="size-10 text-error" aria-hidden />
      <h2 class="text-h2 text-highlighted">{{ title }}</h2>
      <p class="max-w-xs text-sm text-muted">{{ CONNECTION_ERROR_MESSAGE }}</p>
      <UButton variant="outline" color="error" size="sm" @click="emit('retry')">
        Retry
      </UButton>
    </div>
  </template>
  <slot v-else />
</template>
