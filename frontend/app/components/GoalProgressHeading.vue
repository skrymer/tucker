<script setup lang="ts">
const props = defineProps<{ paceStatus: PaceStatus | null | undefined }>()

const pace = computed(() => paceBadge(props.paceStatus))
</script>

<template>
  <h2 class="text-h2 text-highlighted">Goal progress</h2>
  <UBadge v-if="pace" :color="pace.color" variant="subtle" size="sm">
    {{ pace.label }}
  </UBadge>
</template>
