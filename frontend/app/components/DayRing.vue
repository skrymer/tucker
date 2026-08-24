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

// The two arcs, outer calories over inner protein, each drawn over a faint tint
// of its own role. RingGauge owns the geometry the Goal ring shares.
const R_OUTER = 72
const R_INNER = 52

// Over budget once the *rounded* remaining goes negative — deciding on the same
// rounded figure the centre shows means a -0.3 kcal overage never flips the ring
// to a red "0 kcal over". Drives the calorie arc + centre colour.
const isOver = computed(() => Math.round(props.caloriesRemaining) < 0)

const arcs = computed<RingArc[]>(() => [
  {
    radius: R_OUTER,
    stroke: isOver.value ? 'var(--ui-error)' : 'var(--ui-primary)',
    consumed: props.caloriesConsumed,
    target: props.calorieBudget,
  },
  {
    radius: R_INNER,
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

// The accessible legend beside the ring: the figures as text plus meters capped
// at their target so an over-target day shows a full bar, not an overflow.
function useLegend() {
  const caloriesLegend = computed(
    () =>
      `${Math.round(props.caloriesConsumed)} / ${Math.round(props.calorieBudget)} kcal`,
  )
  const proteinLegend = computed(
    () =>
      `${Math.round(props.proteinConsumed)} / ${Math.round(props.proteinFloor)} g`,
  )
  const caloriesBar = computed(() =>
    Math.min(props.caloriesConsumed, props.calorieBudget),
  )
  const proteinBar = computed(() =>
    Math.min(props.proteinConsumed, props.proteinFloor),
  )
  return { caloriesLegend, proteinLegend, caloriesBar, proteinBar }
}
const { caloriesLegend, proteinLegend, caloriesBar, proteinBar } = useLegend()
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

    <div class="flex w-full flex-col gap-4">
      <div>
        <div class="mb-1 flex items-center gap-2">
          <span
            class="size-2.5 rounded"
            :class="isOver ? 'bg-error' : 'bg-primary'"
          />
          <span class="text-sm font-semibold text-default">Calories</span>
        </div>
        <p class="text-sm text-muted">{{ caloriesLegend }}</p>
        <UProgress
          class="mt-2"
          :model-value="caloriesBar"
          :max="calorieBudget"
          :color="isOver ? 'error' : 'primary'"
          aria-label="Calories against the Calorie Budget"
        />
      </div>
      <div>
        <div class="mb-1 flex items-center gap-2">
          <span class="size-2.5 rounded bg-secondary" />
          <span class="text-sm font-semibold text-default">Protein</span>
        </div>
        <p class="text-sm text-muted">{{ proteinLegend }}</p>
        <UProgress
          class="mt-2"
          :model-value="proteinBar"
          :max="proteinFloor"
          color="secondary"
          aria-label="Protein against the Protein Floor"
        />
      </div>
    </div>
  </div>
</template>
