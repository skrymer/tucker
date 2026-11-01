<script setup lang="ts">
/**
 * The Goal card over a failed read, which can say neither whether there is a
 * Goal nor whether the User is maintaining — so only the band, and the error.
 */
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ error: unknown }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <ContentCard
    subject="goal"
    title="Goal"
    :error="error"
    error-title="Couldn't load your goal"
    @retry="emit('retry')"
  />
</template>
