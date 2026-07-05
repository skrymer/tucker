<script setup lang="ts">
// The Day Ring (frontend/DESIGN.md) — Tucker's signature. Outer arc = calories
// against the Calorie Budget (green, error red once over), inner arc = protein
// against the Protein Floor (coral). Every figure is backend-sourced (ADR 0002);
// only the arc sweep and colours are presentation. The SVG is decorative
// (aria-hidden) — the legend rows are the accessible equivalent, and no arc is
// ever colour-alone (its number sits beside it).
const props = defineProps<{
  caloriesConsumed: number
  calorieBudget: number
  caloriesRemaining: number
  proteinConsumed: number
  proteinFloor: number
}>()

// Arc circumferences for the two radii (r 72 outer, 52 inner). A capped
// ringFraction sets each sweep, so an over-target day fills the ring, never past.
const CIRC_OUTER = 2 * Math.PI * 72
const CIRC_INNER = 2 * Math.PI * 52

// Over budget once the *rounded* remaining goes negative — deciding on the same
// rounded figure the centre shows means a −0.3 kcal overage never flips the ring
// to a red "0 kcal over". Drives the calorie arc + centre colour and its track.
const isOver = computed(() => Math.round(props.caloriesRemaining) < 0)

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

// The two arc sweeps as SVG dash offsets (a full arc is offset 0, an empty arc
// the whole circumference), each over a faint tint of its *own* role so
// re-skinning a role — or the calorie arc flipping to error — never leaves the
// track on a stale hue (e.g. a red arc over a green track).
function useArcs() {
  const caloriesOffset = computed(
    () =>
      CIRC_OUTER *
      (1 - ringFraction(props.caloriesConsumed, props.calorieBudget)),
  )
  const proteinOffset = computed(
    () =>
      CIRC_INNER *
      (1 - ringFraction(props.proteinConsumed, props.proteinFloor)),
  )
  const caloriesTrack = computed(() =>
    isOver.value
      ? 'color-mix(in srgb, var(--ui-error) 15%, transparent)'
      : 'color-mix(in srgb, var(--ui-primary) 15%, transparent)',
  )
  const proteinTrack =
    'color-mix(in srgb, var(--ui-secondary) 15%, transparent)'
  return { caloriesOffset, proteinOffset, caloriesTrack, proteinTrack }
}
const { caloriesOffset, proteinOffset, caloriesTrack, proteinTrack } = useArcs()

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
    <div class="relative size-40 shrink-0">
      <svg
        class="-rotate-90"
        width="160"
        height="160"
        viewBox="0 0 176 176"
        aria-hidden="true"
      >
        <circle
          cx="88"
          cy="88"
          r="72"
          fill="none"
          :stroke="caloriesTrack"
          stroke-width="15"
        />
        <circle
          cx="88"
          cy="88"
          r="72"
          fill="none"
          :stroke="isOver ? 'var(--ui-error)' : 'var(--ui-primary)'"
          stroke-width="15"
          stroke-linecap="round"
          :stroke-dasharray="CIRC_OUTER"
          :stroke-dashoffset="caloriesOffset"
        />
        <circle
          cx="88"
          cy="88"
          r="52"
          fill="none"
          :stroke="proteinTrack"
          stroke-width="15"
        />
        <circle
          cx="88"
          cy="88"
          r="52"
          fill="none"
          stroke="var(--ui-secondary)"
          stroke-width="15"
          stroke-linecap="round"
          :stroke-dasharray="CIRC_INNER"
          :stroke-dashoffset="proteinOffset"
        />
      </svg>
      <div class="absolute inset-0 grid place-content-center text-center">
        <span
          class="font-display text-4xl font-extrabold tabular-nums"
          :class="isOver ? 'text-error' : 'text-highlighted'"
        >
          {{ centreValue }}
        </span>
        <span class="text-xs font-semibold text-muted">{{ centreLabel }}</span>
      </div>
    </div>

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
