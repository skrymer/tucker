<script setup lang="ts">
// The Day Ring (frontend/DESIGN.md) — Tucker's signature. Outer arc = calories
// against the Calorie Budget (green, error red once over), inner arc = protein
// against the Protein Floor (coral). Every figure is backend-sourced (ADR 0002);
// only the arc sweep and colours are presentation. The SVG is decorative
// (aria-hidden) — the legend rows are the accessible equivalent, and no arc is
// ever colour-alone (its number sits beside it).
import type { RingArc } from '~/utils/ring'

const props = defineProps<{
  caloriesConsumed: number
  calorieBudget: number
  caloriesRemaining: number
  proteinConsumed: number
  proteinFloor: number
}>()

// Over budget once the *rounded* remaining goes negative — deciding on the same
// rounded figure the centre shows means a -0.3 kcal overage never flips the ring
// to a red "0 kcal over". Drives the calorie arc + centre colour.
const isOver = computed(() => Math.round(props.caloriesRemaining) < 0)

// Calories outside protein, each arc drawn over a faint tint of its own role.
const arcs = computed<RingArc[]>(() => [
  {
    radius: RING_RADIUS_OUTER,
    stroke: isOver.value ? 'var(--ui-error)' : 'var(--ui-primary)',
    consumed: props.caloriesConsumed,
    target: props.calorieBudget,
  },
  {
    radius: RING_RADIUS_INNER,
    stroke: 'var(--ui-secondary)',
    consumed: props.proteinConsumed,
    target: props.proteinFloor,
  },
])

// The ring's centre: the signed remaining figure as an absolute value with a
// left/over label.
function useCentre() {
  const centreValue = computed(() =>
    Math.abs(Math.round(props.caloriesRemaining)),
  )
  const centreLabel = computed(() => (isOver.value ? 'kcal over' : 'kcal left'))
  return { centreValue, centreLabel }
}
const { centreValue, centreLabel } = useCentre()

// The accessible legend beside the ring, as rows rather than parallel values, so
// the shape each row is drawn in is stated once. Meters are capped at their
// target, so an over-target day shows a full bar rather than an overflow.
function useLegend() {
  const rows = computed(() => [
    {
      title: 'Calories',
      swatch: isOver.value ? 'bg-error' : 'bg-primary',
      meter: isOver.value ? ('error' as const) : ('primary' as const),
      label: 'Calories against the Calorie Budget',
      figures: formatAgainstTarget(
        props.caloriesConsumed,
        props.calorieBudget,
        'kcal',
      ),
      filled: Math.min(props.caloriesConsumed, props.calorieBudget),
      target: props.calorieBudget,
    },
    {
      title: 'Protein',
      swatch: 'bg-secondary',
      meter: 'secondary' as const,
      label: 'Protein against the Protein Floor',
      figures: formatAgainstTarget(
        props.proteinConsumed,
        props.proteinFloor,
        'g',
      ),
      filled: Math.min(props.proteinConsumed, props.proteinFloor),
      target: props.proteinFloor,
    },
  ])
  return { rows }
}
const { rows } = useLegend()
</script>

<template>
  <div class="flex flex-col items-center gap-6 sm:flex-row">
    <RingGauge :arcs="arcs">
      <span
        class="font-display text-4xl font-extrabold tabular-nums"
        :class="isOver ? 'text-error' : 'text-highlighted'"
      >
        {{ centreValue }}
      </span>
      <span class="text-xs font-semibold text-muted">{{ centreLabel }}</span>
    </RingGauge>

    <!-- Swatch, title and meter share a line; the figures keep their own, so the
         spelled-out unit is never squeezed (frontend/DESIGN.md). -->
    <div class="flex w-full flex-col gap-4">
      <div v-for="row in rows" :key="row.title">
        <div class="mb-1 flex items-center gap-3">
          <span class="size-2.5 shrink-0 rounded" :class="row.swatch" />
          <span class="shrink-0 text-sm font-semibold text-default">
            {{ row.title }}
          </span>
          <!-- `get-value-label`, never `aria-label`: the attribute never reaches
               the progressbar element (frontend/DESIGN.md). -->
          <UProgress
            class="min-w-16 flex-1"
            :model-value="row.filled"
            :max="row.target"
            :color="row.meter"
            :get-value-label="() => row.label"
          />
        </div>
        <p class="text-sm tabular-nums text-muted">{{ row.figures }}</p>
      </div>
    </div>
  </div>
</template>
