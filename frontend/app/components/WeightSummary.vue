<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  latest: components['schemas']['WeightMeasurementResponse'] | null
  previous?: components['schemas']['WeightMeasurementResponse'] | null
}>()

const formattedDate = computed(() =>
  props.latest ? formatDateFromISO(props.latest.measuredOn) : '',
)

// The change from the previous reading to the latest, as a neutral, factual
// chip: which way and how much since the last reading. It deliberately does NOT
// judge that change good or bad — a single raw latest-vs-previous delta is the
// noisy signal the domain refuses to act on. Whether the user is on track is
// the backend's call, computed on the smoothed Trend Weight as Pace/Drift Status
// (CONTEXT.md, ADR 0002), never re-derived here. Null with no prior reading.
function useWeightDelta() {
  return computed(() => {
    if (!props.latest || !props.previous) return null

    // Compare the values as they're displayed (rounded to one decimal) so the
    // chip can never contradict the headline and rows beside it — e.g. 84.75
    // ("84.8") vs 84.70 ("84.7") is a 0.1 kg change, not "No change".
    const round1 = (kg: number) => Math.round(kg * 10) / 10
    const change =
      round1(props.latest.weightKg) - round1(props.previous.weightKg)
    const magnitude = `${Math.abs(change).toFixed(1)} kg`

    if (Math.abs(change) < 0.05) {
      return { icon: 'i-lucide-minus', text: 'No change', label: 'No change' }
    }
    if (change < 0) {
      return {
        icon: 'i-lucide-arrow-down',
        text: magnitude,
        label: `Down ${magnitude}`,
      }
    }
    return {
      icon: 'i-lucide-arrow-up',
      text: magnitude,
      label: `Up ${magnitude}`,
    }
  })
}

const delta = useWeightDelta()
</script>

<template>
  <UCard v-if="latest">
    <h3 class="text-sm font-medium text-muted">Latest</h3>
    <div class="mt-1 flex items-baseline justify-between gap-3">
      <p class="text-2xl font-bold text-default">
        {{ latest.weightKg.toFixed(1) }} kg
      </p>
      <UBadge
        v-if="delta"
        color="neutral"
        :icon="delta.icon"
        variant="subtle"
        :aria-label="delta.label"
      >
        {{ delta.text }}
      </UBadge>
    </div>
    <p class="mt-1 text-sm text-muted">{{ formattedDate }}</p>
  </UCard>
</template>
