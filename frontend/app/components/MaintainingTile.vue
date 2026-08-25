<script setup lang="ts">
const props = defineProps<{
  trendWeightKg: number
  driftStatus: DriftStatus
}>()

const trendWeight = computed(() => `${props.trendWeightKg.toFixed(1)} kg`)

// The drift badge carries the status; it's the single colour-coded source of
// truth, so the old all-good check icon is gone (it lied while drifting).
const drift = computed(() => driftBadge(props.driftStatus))

// A calm line under the badge — a displayed status, never an alert (ADR 0008).
//
// Two sentences per status, not a partial override: the drifting ones close on
// the Budget self-correcting, which is a promise only a tracking User's app can
// keep, and an exhaustive map makes the compiler ask for the weight-only wording
// the day a status is added or the tracking wording starts naming the Budget.
const { tracksCalories } = useCalorieTracking()

const DRIFT_DESCRIPTIONS: Record<
  DriftStatus,
  { tracking: string; weightOnly: string }
> = {
  holding: {
    tracking: 'Holding steady at your trend weight.',
    weightOnly: 'Holding steady at your trend weight.',
  },
  'drifting-up': {
    tracking: 'Trending up — your budget will adjust to bring it back.',
    weightOnly: 'Trending up over the last four weeks.',
  },
  'drifting-down': {
    tracking: 'Trending down — your budget will adjust to bring it back.',
    weightOnly: 'Trending down over the last four weeks.',
  },
  'gathering-data': {
    tracking: 'Gathering data — a couple more readings to read your trend.',
    weightOnly: 'Gathering data — a couple more readings to read your trend.',
  },
}

const description = computed(() =>
  tracksCalories.value
    ? DRIFT_DESCRIPTIONS[props.driftStatus].tracking
    : DRIFT_DESCRIPTIONS[props.driftStatus].weightOnly,
)
</script>

<template>
  <UCard>
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-medium text-muted">Maintaining</h2>
      <UBadge :color="drift.color" variant="subtle" size="sm">
        {{ drift.label }}
      </UBadge>
    </div>
    <p class="mt-1 text-4xl font-bold text-default">{{ trendWeight }}</p>
    <p class="mt-1 text-sm text-muted">{{ description }}</p>
  </UCard>
</template>
