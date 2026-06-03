<script setup lang="ts">
import type { LedgerRow } from '~/utils/reviewLedger'

defineProps<{ row: LedgerRow }>()
</script>

<template>
  <UCard>
    <div class="flex items-start justify-between gap-3">
      <p class="text-sm font-medium text-muted">
        {{ formatDateFromISO(row.review.reviewedOn) }}
      </p>
      <UBadge
        :color="row.isAdaptive ? 'primary' : 'neutral'"
        variant="subtle"
        size="sm"
      >
        {{ row.isAdaptive ? 'Adaptive' : 'Seed' }}
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
