<script setup lang="ts">
/**
 * `to` is set where the Add sheet lives on another page — the Log destination
 * picks from the catalog and never creates a Food (ADR 0028), so its dead end
 * has to be a link rather than a button opening a sheet that isn't there.
 */
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ to?: string }>()

const emit = defineEmits<{ add: [] }>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-12 text-center">
    <UIcon name="i-lucide-salad" class="size-10 text-muted" aria-hidden />
    <h2 class="text-lg font-semibold text-default">Build your food catalog</h2>
    <p class="max-w-xs text-sm text-muted">
      Add the foods you eat regularly so logging takes a tap.
    </p>
    <UButton variant="outline" size="sm" :to="to" @click="emit('add')">
      Add your first food
    </UButton>
  </div>
</template>
