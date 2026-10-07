<script setup lang="ts">
import type { RelativeDay } from '~/utils/day'

const day = defineModel<RelativeDay>({ required: true })

// Labelled from the local day as it stands, so a sheet left open over midnight
// names the day it will now log on.
const today = useLocalDay()
const options = computed(() => [
  {
    value: 'today' as const,
    icon: RELATIVE_DAYS.today.icon,
    label: relativeDayHeading('today', today.value),
  },
  {
    value: 'tomorrow' as const,
    icon: RELATIVE_DAYS.tomorrow.icon,
    label: relativeDayHeading('tomorrow', localTomorrow(today.value)),
  },
])

/** An arrow key moves the choice to the neighbouring day, wrapping, and focus with it. */
async function step(event: KeyboardEvent, by: 1 | -1) {
  const group = event.currentTarget as HTMLElement
  const values = options.value.map((option) => option.value)
  const next = (values.indexOf(day.value) + by + values.length) % values.length
  day.value = values[next]!
  await nextTick()
  group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
}
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Day to log for"
    class="flex gap-2"
    @keydown.arrow-right.prevent="step($event, 1)"
    @keydown.arrow-down.prevent="step($event, 1)"
    @keydown.arrow-left.prevent="step($event, -1)"
    @keydown.arrow-up.prevent="step($event, -1)"
  >
    <UButton
      v-for="option in options"
      :key="option.value"
      role="radio"
      :aria-checked="day === option.value"
      :tabindex="day === option.value ? 0 : -1"
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
