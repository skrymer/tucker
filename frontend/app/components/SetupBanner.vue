<script setup lang="ts">
const props = defineProps<{
  calorieBudget: number | null | undefined
}>()

// The budget is null until the first weekly review has run; until then,
// setup isn't finished and the dashboard can't show a budget.
const setupComplete = computed(() => props.calorieBudget != null)
</script>

<template>
  <UAlert
    v-if="!setupComplete"
    icon="i-lucide-settings"
    color="primary"
    variant="subtle"
    title="Finish setup to see your calorie budget"
    :actions="[{ label: 'Finish setup', to: '/profile', color: 'primary' }]"
  />
</template>
