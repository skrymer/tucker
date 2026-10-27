<script setup lang="ts">
const props = defineProps<{
  p50Ms: number
  p95Ms: number
  /** The shared axis: its gridline positions and its top, in ms. */
  ticks: number[]
  top: number
}>()

const { p50, p95 } = DUMBBELL_MARKS
const at = (ms: number) => `${(ms / props.top) * 100}%`
</script>

<template>
  <svg width="100%" height="28" aria-hidden="true" class="overflow-visible">
    <line
      v-for="t in ticks"
      :key="t"
      :x1="at(t)"
      :x2="at(t)"
      y1="0"
      y2="28"
      stroke="var(--ui-border)"
    />
    <line
      :x1="at(p50Ms)"
      :x2="at(p95Ms)"
      y1="14"
      y2="14"
      :stroke="DUMBBELL_STEM"
      stroke-width="3"
      stroke-linecap="round"
    />
    <circle
      :cx="at(p50Ms)"
      cy="14"
      :r="p50.r"
      :fill="p50.fill"
      :stroke="p50.stroke"
      stroke-width="2"
    />
    <circle
      :cx="at(p95Ms)"
      cy="14"
      :r="p95.r"
      :fill="p95.fill"
      :stroke="p95.stroke"
    />
  </svg>
</template>
