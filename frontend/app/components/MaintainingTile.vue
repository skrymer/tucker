<script setup lang="ts">
const props = defineProps<{
  trendWeightKg: number
  driftStatus: DriftStatus
}>()

const trendWeight = computed(() => `${props.trendWeightKg.toFixed(1)} kg`)

// The drift badge carries the status; it's the single colour-coded source of
// truth, so the old all-good check icon is gone (it lied while drifting).
const drift = computed(() => driftBadge(props.driftStatus))

// A calm line under the badge — the drift states close on the budget
// self-correcting (ADR 0008: displayed status, not an alert).
const DRIFT_DESCRIPTIONS: Record<DriftStatus, string> = {
  holding: 'Holding steady at your trend weight.',
  'drifting-up': 'Trending up — your budget will adjust to bring it back.',
  'drifting-down': 'Trending down — your budget will adjust to bring it back.',
  'gathering-data':
    'Gathering data — a couple more weigh-ins to read your trend.',
}
const description = computed(() => DRIFT_DESCRIPTIONS[props.driftStatus])
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
