<script setup lang="ts">
import type { LedgerRow } from '~/utils/reviewLedger'

const props = defineProps<{ row: LedgerRow }>()

const targets = computed(() => props.row.review.intakeTargets)

/**
 * The card's hero figure. A review run with Calorie Tracking off has no Budget,
 * so its own remaining job leads: the Trend Weight, with its week-over-week
 * change, rather than an em-dash where a Budget was.
 */
const headline = computed(() =>
  targets.value
    ? {
        value: Math.round(targets.value.calorieBudgetKcal).toString(),
        label: 'kcal budget',
        delta: props.row.targetsDelta?.calorieBudgetKcal ?? null,
        decimals: 0,
      }
    : {
        value: props.row.review.trendWeightKg.toFixed(1),
        label: 'kg trend',
        delta: props.row.trendDelta,
        decimals: 1,
      },
)
</script>

<template>
  <UCard>
    <div class="flex items-start justify-between gap-3">
      <p class="text-sm font-medium text-muted">
        {{ formatDateFromISO(row.review.reviewedOn) }}
      </p>
      <LedgerBasisBadge :basis="targets?.maintenanceBasis" />
    </div>

    <div class="mt-1 flex items-baseline gap-2">
      <p class="text-4xl font-bold text-default tabular-nums">
        {{ headline.value }}
      </p>
      <p class="text-sm text-muted">{{ headline.label }}</p>
      <ReviewDelta
        :value="headline.delta"
        :decimals="headline.decimals"
        class="ml-auto self-center"
      />
    </div>

    <p v-if="targets" class="mt-2 text-sm text-muted tabular-nums">
      {{ row.review.trendWeightKg.toFixed(1) }} kg trend ·
      {{ Math.round(targets.maintenanceKcal) }} kcal maint ·
      {{ Math.round(targets.proteinFloorG) }} g protein
    </p>
  </UCard>
</template>
