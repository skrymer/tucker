<script setup lang="ts">
defineProps<{ pace: ReturnType<typeof paceBadge> }>()
</script>

<template>
  <h2 class="text-h2 text-highlighted">Goal progress</h2>
  <UBadge v-if="pace" :color="pace.color" variant="subtle" size="sm">
    {{ pace.label }}
  </UBadge>
</template>
