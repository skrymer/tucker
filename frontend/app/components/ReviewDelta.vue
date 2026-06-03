<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Signed change vs the previous review; null when there is no previous. */
    value: number | null
    /** Decimal places — 0 for kcal/protein, 1 for weight. */
    decimals?: number
    /** Show an em-dash when there is no change (desktop table) vs nothing. */
    placeholder?: boolean
  }>(),
  { decimals: 0, placeholder: false },
)

// A delta that rounds to zero reads as "no change", same as no previous review:
// neither sprouts an arrow.
const rounded = computed(() =>
  props.value == null ? null : Number(props.value.toFixed(props.decimals)),
)
const isChange = computed(() => rounded.value != null && rounded.value !== 0)
const up = computed(() => (rounded.value ?? 0) > 0)
const magnitude = computed(() =>
  Math.abs(rounded.value ?? 0).toFixed(props.decimals),
)
</script>

<template>
  <!-- Muted, never green/red: the "good" direction differs per column. The
       triangle is decorative; the sign and an sr-only phrase carry the meaning. -->
  <span
    v-if="isChange"
    class="text-xs text-muted tabular-nums whitespace-nowrap"
  >
    <span aria-hidden="true">{{ up ? '▲ +' : '▼ −' }}{{ magnitude }}</span>
    <span class="sr-only">
      {{ up ? 'up by' : 'down by' }} {{ magnitude }} versus the previous review
    </span>
  </span>
  <span v-else-if="placeholder" aria-hidden="true" class="text-xs text-muted"
    >—</span
  >
</template>
