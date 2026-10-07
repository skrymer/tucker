<script setup lang="ts">
const day = defineModel<'today' | 'tomorrow'>({ required: true })

const today = useLocalDay()
const options = computed(() => [
  {
    value: 'today' as const,
    icon: 'i-lucide-sun',
    label: `Today · ${formatDayHeadingFromISO(today.value)}`,
  },
  {
    value: 'tomorrow' as const,
    icon: 'i-lucide-sunrise',
    label: `Tomorrow · ${formatDayHeadingFromISO(localTomorrow(today.value))}`,
  },
])
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
