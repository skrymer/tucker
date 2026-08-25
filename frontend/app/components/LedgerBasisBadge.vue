<script setup lang="ts">
import { REVIEW_BASIS_BADGE, type ReviewBasis } from '~/utils/reviewLedger'

const props = withDefaults(
  defineProps<{
    /** The review's Maintenance Basis; absent for a review with no Intake Targets. */
    basis: ReviewBasis | null | undefined
    /** Show an em-dash when there is none (the desktop table) vs nothing. */
    placeholder?: boolean
  }>(),
  { placeholder: false },
)

const badge = computed(() =>
  props.basis ? REVIEW_BASIS_BADGE[props.basis] : null,
)
</script>

<template>
  <UBadge v-if="badge" :color="badge.color" variant="subtle" size="sm">
    {{ badge.label }}
  </UBadge>
  <!-- No Maintenance, so nothing for a basis to be the basis of. Decorative, the
       same em-dash idiom ReviewDelta and LedgerFigure use. -->
  <span v-else-if="placeholder" aria-hidden="true" class="text-default">—</span>
</template>
