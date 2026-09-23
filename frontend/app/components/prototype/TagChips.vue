<script setup lang="ts">
// PROTOTYPE — single-select Tag chips. `null` is "All".
defineProps<{ tags: string[] }>()
const chosen = defineModel<string | null>({ required: true })
</script>

<template>
  <div role="group" aria-label="Filter by tag" class="flex flex-wrap gap-2">
    <UButton
      size="sm"
      :variant="chosen === null ? 'solid' : 'outline'"
      :color="chosen === null ? 'primary' : 'neutral'"
      class="shrink-0 rounded-full"
      :aria-pressed="chosen === null"
      @click="chosen = null"
    >
      All
    </UButton>
    <UButton
      v-for="tag in tags"
      :key="tag"
      size="sm"
      :variant="chosen === tag ? 'solid' : 'outline'"
      :color="chosen === tag ? 'primary' : 'neutral'"
      class="shrink-0 rounded-full capitalize"
      :aria-pressed="chosen === tag"
      @click="chosen = chosen === tag ? null : tag"
    >
      {{ tag }}
    </UButton>
  </div>
</template>
