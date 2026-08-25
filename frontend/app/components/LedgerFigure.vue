<script setup lang="ts">
withDefaults(
  defineProps<{
    /** The figure; absent for a review with no Intake Targets. */
    value: number | null | undefined
    /** Signed change vs the previous review; absent when there is nothing to compare. */
    delta: number | null | undefined
    /** Decimal places — 0 for kcal/protein, 1 for weight. */
    decimals?: number
    /** Give the figure the row's leading weight (the Budget column). */
    lead?: boolean
  }>(),
  { decimals: 0, lead: false },
)
</script>

<template>
  <div class="flex flex-col items-end tabular-nums">
    <span class="text-default" :class="{ 'font-semibold': lead }">
      <template v-if="value != null">{{ value.toFixed(decimals) }}</template>
      <!-- The same em-dash idiom ReviewDelta uses: decorative, so a screen reader
           hears nothing rather than "dash" repeated across four columns. -->
      <template v-else><span aria-hidden="true">—</span></template>
    </span>
    <!-- No figure, no place for a delta: two stacked em-dashes would read as a
         column that lost its numbers rather than a week that never had them. -->
    <ReviewDelta
      v-if="value != null"
      :value="delta ?? null"
      :decimals="decimals"
      placeholder
    />
  </div>
</template>
