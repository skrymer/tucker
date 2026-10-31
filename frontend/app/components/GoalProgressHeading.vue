<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ paceStatus: PaceStatus | null | undefined }>()
</script>

<template>
  <h2 class="text-h2 text-highlighted">Goal progress</h2>
  <PaceBadge :pace-status="paceStatus" />
</template>
