<script setup lang="ts">
import type { HeldReason } from '~/utils/heldReason'
import { reviewBasisBadge, type ReviewBasis } from '~/utils/reviewLedger'

// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
const props = withDefaults(
  defineProps<{
    /** The review's Maintenance Basis; absent for a review with no Intake Targets. */
    basis: ReviewBasis | null | undefined
    /**
     * Which condition held it, where the review records one. Absent on every basis
     * but `HELD`, and on the held reviews written before Tucker recorded it — both
     * of which fall back to the bare basis label.
     */
    heldReason?: HeldReason | null
    /** Show an em-dash when there is none (the desktop table) vs nothing. */
    placeholder?: boolean
  }>(),
  { heldReason: null, placeholder: false },
)
// Stryker restore all

const badge = computed(() => reviewBasisBadge(props.basis, props.heldReason))
</script>

<template>
  <UBadge v-if="badge" :color="badge.color" variant="subtle" size="sm">
    {{ badge.label }}
  </UBadge>
  <!-- No Maintenance, so nothing for a basis to be the basis of. Decorative, the
       same em-dash idiom ReviewDelta and LedgerFigure use. -->
  <span v-else-if="placeholder" aria-hidden="true" class="text-default">—</span>
</template>
