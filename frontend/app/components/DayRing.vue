<script setup lang="ts">
// The Day Ring (frontend/DESIGN.md) — Tucker's signature. Outer arc = calories
// against the Calorie Budget (green; warning amber slightly over, error red over
// budget — the backend's day verdict decides which), inner arc = protein
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
  dayStatus: DayStatus | null | undefined
}>()

// Over budget once the *rounded* remaining goes negative — deciding on the same
// rounded figure the centre shows means a -0.3 kcal overage never flips the ring
// to "0 kcal over".
const isOver = computed(() => Math.round(props.caloriesRemaining) < 0)

// The calorie arc, swatch and meter's colour role. Only error reaches the centre
// figure: light-mode warning is under 3:1, too faint for a large figure.
const calorieTone = computed(() => {
  if (!isOver.value) return 'primary' as const
  return props.dayStatus === 'slightly-over'
    ? ('warning' as const)
    : ('error' as const)
})
const CALORIE_SWATCH = {
  primary: 'bg-primary',
  warning: 'bg-warning',
  error: 'bg-error',
}

// Calories outside protein, each arc drawn over a faint tint of its own role.
const arcs = computed<RingArc[]>(() => [
  {
    radius: RING_RADIUS_OUTER,
    stroke: `var(--ui-${calorieTone.value})`,
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
  function measured(consumed: number, target: number, unit: string) {
    return {
      figures: formatAgainstTarget(consumed, target, unit),
      filled: Math.min(consumed, target),
      target,
    }
  }
  const rows = computed(() => [
    {
      title: 'Calories',
      swatch: CALORIE_SWATCH[calorieTone.value],
      meter: calorieTone.value,
      label: 'Calories against the Calorie Budget',
      ...measured(props.caloriesConsumed, props.calorieBudget, 'kcal'),
    },
    {
      title: 'Protein',
      swatch: 'bg-secondary',
      meter: 'secondary' as const,
      label: 'Protein against the Protein Floor',
      ...measured(props.proteinConsumed, props.proteinFloor, 'g'),
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
        class="text-ring-figure tabular-nums"
        :class="calorieTone === 'error' ? 'text-error' : 'text-highlighted'"
      >
        {{ centreValue }}
      </span>
      <span class="text-label text-muted">{{ centreLabel }}</span>
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
