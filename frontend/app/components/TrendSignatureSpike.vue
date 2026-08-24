<script setup lang="ts">
// SPIKE (F12 throwaway) — variant C. DESIGN.md spends boldness in one place;
// for a weight-only User the one thing that changes daily, with or without a
// Goal, is the Trend Weight. The sparkline is the raw readings (dimmed) under
// the smoothed trend line (brand green), which is exactly the domain's story:
// a noisy signal and the smoothed one Tucker actually acts on.
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  measurements: components['schemas']['WeightMeasurementResponse'][]
  trendWeightKg: number | null | undefined
  progress: components['schemas']['GoalProgressResponse'] | null | undefined
  driftStatus: DriftStatus
}>()

const W = 320
const H = 72

// SPIKE ONLY — the dev database holds a single reading, so a synthetic 28-day
// series stands in to judge the shape. Never ships.
const SYNTHETIC = [
  73.4, 73.6, 73.1, 73.3, 72.9, 73.2, 72.8, 72.6, 72.9, 72.4, 72.7, 72.3, 72.5,
  72.0, 72.3, 71.9, 72.1, 71.8, 72.0, 71.6, 71.9, 71.5, 71.8, 71.4, 71.6, 71.3,
  71.5, 71.2,
].map((weightKg, i) => ({ id: i, measuredOn: `2026-07-${i + 1}`, weightKg }))

// Last 30 readings, oldest first.
const recent = computed(() =>
  props.measurements.length > 1 ? props.measurements.slice(-30) : SYNTHETIC,
)

// A 10%-weight EWMA, the same smoothing the backend applies, so the spike shows
// the real shape rather than a decorative squiggle.
const trendSeries = computed(() => {
  let t: number | null = null
  return recent.value.map((m) => {
    t = t == null ? m.weightKg : t + 0.1 * (m.weightKg - t)
    return t
  })
})

const bounds = computed(() => {
  const all = [...recent.value.map((m) => m.weightKg), ...trendSeries.value]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const pad = (max - min || 1) * 0.15
  return { min: min - pad, max: max + pad }
})

function point(i: number, kg: number) {
  const n = Math.max(recent.value.length - 1, 1)
  const x = (i / n) * W
  const { min, max } = bounds.value
  const y = H - ((kg - min) / (max - min)) * H
  return [x, y] as const
}

const trendPath = computed(() =>
  trendSeries.value
    .map((kg, i) => {
      const [x, y] = point(i, kg)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' '),
)

const dots = computed(() =>
  recent.value.map((m, i) => {
    const [x, y] = point(i, m.weightKg)
    return { x, y, key: m.measuredOn }
  }),
)

const trend = computed(() =>
  props.trendWeightKg != null ? props.trendWeightKg.toFixed(1) : '—',
)

// One line under the figure: the Goal if there is one, else the drift status.
const pace = computed(() =>
  props.progress?.paceStatus ? paceBadge(props.progress.paceStatus) : null,
)
const drift = computed(() => driftBadge(props.driftStatus))
const badge = computed(() => (props.progress ? pace.value : drift.value))
const caption = computed(() =>
  props.progress
    ? `${props.progress.kgToGo.toFixed(1)} kg to go · ${Math.round(props.progress.percentComplete)}% complete`
    : 'No goal — holding at your trend weight.',
)
</script>

<template>
  <UCard>
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-medium text-muted">Trend weight</h2>
      <UBadge v-if="badge" :color="badge.color" variant="subtle" size="sm">
        {{ badge.label }}
      </UBadge>
    </div>

    <p
      class="mt-1 font-display text-5xl font-extrabold tabular-nums text-highlighted"
    >
      {{ trend }}<span class="ml-1 text-2xl text-muted">kg</span>
    </p>

    <svg
      v-if="recent.length > 1"
      class="mt-3 w-full"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
      :height="H"
      aria-hidden="true"
    >
      <circle
        v-for="d in dots"
        :key="d.key"
        :cx="d.x"
        :cy="d.y"
        r="2"
        fill="var(--ui-text-dimmed)"
      />
      <path
        :d="trendPath"
        fill="none"
        stroke="var(--ui-primary)"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <p class="mt-2 text-sm text-muted">{{ caption }}</p>
  </UCard>
</template>
