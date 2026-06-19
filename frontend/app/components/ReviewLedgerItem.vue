<script setup lang="ts">
import { REVIEW_BASIS_BADGE, type LedgerRow } from '~/utils/reviewLedger'

const props = defineProps<{ row: LedgerRow }>()

const badge = computed(
  () => REVIEW_BASIS_BADGE[props.row.review.maintenanceBasis],
)
</script>

<template>
  <UCard>
    <div class="flex items-start justify-between gap-3">
      <p class="text-sm font-medium text-muted">
        {{ formatDateFromISO(row.review.reviewedOn) }}
      </p>
      <UBadge :color="badge.color" variant="subtle" size="sm">
        {{ badge.label }}
      </UBadge>
    </div>

    <div class="mt-1 flex items-baseline gap-2">
      <p class="text-4xl font-bold text-default tabular-nums">
        {{ Math.round(row.review.calorieBudgetKcal) }}
      </p>
      <p class="text-sm text-muted">kcal budget</p>
      <ReviewDelta
        :value="row.delta?.calorieBudgetKcal ?? null"
        class="ml-auto self-center"
      />
    </div>

    <p class="mt-2 text-sm text-muted tabular-nums">
      {{ row.review.trendWeightKg.toFixed(1) }} kg trend ·
      {{ Math.round(row.review.maintenanceKcal) }} kcal maint ·
      {{ Math.round(row.review.proteinFloorG) }} g protein
    </p>
  </UCard>
</template>
