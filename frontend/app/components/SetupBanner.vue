<script setup lang="ts">
const props = defineProps<{
  /**
   * Whether the User has a Profile and at least one Weight Measurement — the
   * backend's own predicate, arriving on the daily summary (ADR 0002).
   */
  setupComplete: boolean | undefined
}>()

// Setup completeness says *whether* to prompt; Calorie Tracking only picks the
// sentence. A weight-only User with no reading genuinely has setup left, and one
// who has weighed in has none — even though neither will ever see a Budget.
const { tracksCalories } = useCalorieTracking()

// Absent while the summary is still loading: better to say nothing for a moment
// than to flash a prompt at a User who finished setup months ago.
const unfinished = computed(() => props.setupComplete === false)

// Both actions land on `/profile`, which is where a Profile is written and where
// a weight can be added — so the banner reads the same on every page that hosts
// it, rather than depending on what happens to sit below it.
const prompt = computed(() =>
  tracksCalories.value
    ? {
        title: 'Finish setup to see your calorie budget',
        label: 'Finish setup',
      }
    : {
        title: 'Log your first weight to get started',
        label: 'Log your weight',
      },
)
</script>

<template>
  <UAlert
    v-if="unfinished"
    icon="i-lucide-settings"
    color="primary"
    variant="subtle"
    :title="prompt.title"
    :actions="[{ label: prompt.label, to: '/profile', color: 'primary' }]"
  />
</template>
