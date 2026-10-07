<script setup lang="ts">
import type { RelativeDay } from '~/utils/day'

const day = defineModel<RelativeDay>({ required: true })

// Labelled from the local day as it stands, so a sheet left open over midnight
// names the day it will now log on.
const today = useLocalDay()
const options = computed(() =>
  (
    [
      ['today', today.value],
      ['tomorrow', localTomorrow(today.value)],
    ] as const
  ).map(([value, date]) => ({
    value,
    icon: RELATIVE_DAYS[value].icon,
    label: `${RELATIVE_DAYS[value].label} · ${formatDayHeadingFromISO(date)}`,
  })),
)
</script>

<template>
  <div role="radiogroup" aria-label="Day to log for" class="flex gap-2">
    <UButton
      v-for="option in options"
      :key="option.value"
      role="radio"
      :aria-checked="day === option.value"
      :icon="option.icon"
      :color="day === option.value ? 'primary' : 'neutral'"
      :variant="day === option.value ? 'solid' : 'ghost'"
      class="rounded-full"
      @click="day = option.value"
    >
      {{ option.label }}
    </UButton>
  </div>
</template>
