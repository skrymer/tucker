<script setup lang="ts">
const props = defineProps<{
  /** The active Goal's planned rate — the knob the user would turn to resolve this. */
  rateKgPerWeek: number
}>()

// "1.5", never "1.50": the user's own figure, not a re-decimalised one.
const rate = computed(
  () => `${Number(props.rateKgPerWeek.toFixed(2))} kg a week`,
)
</script>

<template>
  <UAlert
    icon="i-lucide-pause-circle"
    color="warning"
    variant="subtle"
    :actions="[
      {
        label: 'Ease your goal',
        to: '/profile',
        color: 'warning',
        variant: 'subtle',
      },
    ]"
  >
    <template #title>
      <h2 class="text-base font-semibold">No deficit is being applied</h2>
    </template>
    <template #description>
      <p>
        Your goal's rate of {{ rate }} needs more of a daily deficit than your
        maintenance can give, so Tucker isn't applying one. Your calorie budget
        below is your full maintenance — you're holding steady, not losing.
      </p>
    </template>
  </UAlert>
</template>
