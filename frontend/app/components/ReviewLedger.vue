<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'
import type { LedgerRow } from '~/utils/reviewLedger'

const props = defineProps<{
  reviews: components['schemas']['WeeklyReviewResponse'][]
}>()

const isDesktop = useIsDesktop()

// The history arrives oldest-first; toLedgerRows reverses it to newest-first and
// attaches each row's delta and basis. Both the table and the cards read it.
const rows = computed(() => toLedgerRows(props.reviews))

// Numeric columns are right-aligned so the stacked value + delta line up.
const numeric = { class: { th: 'text-right', td: 'text-right' } }
const columns: TableColumn<LedgerRow>[] = [
  { id: 'reviewedOn', header: 'Reviewed' },
  { id: 'basis', header: 'Basis' },
  { id: 'calorieBudgetKcal', header: 'Budget', meta: numeric },
  { id: 'trendWeightKg', header: 'Trend wt.', meta: numeric },
  { id: 'maintenanceKcal', header: 'Maintenance', meta: numeric },
  { id: 'proteinFloorG', header: 'Protein floor', meta: numeric },
]
</script>

<template>
  <UTable
    v-if="isDesktop"
    :data="rows"
    :columns="columns"
    caption="Weekly reviews, newest first. Deltas compare each review with the previous one."
    :ui="{ caption: 'text-sm text-muted text-left mb-2' }"
  >
    <template #reviewedOn-cell="{ row }">
      <span class="text-default">
        {{ formatDateFromISO(row.original.review.reviewedOn) }}
      </span>
    </template>

    <template #basis-cell="{ row }">
      <UBadge
        :color="row.original.isAdaptive ? 'primary' : 'neutral'"
        variant="subtle"
        size="sm"
      >
        {{ row.original.isAdaptive ? 'Adaptive' : 'Seed' }}
      </UBadge>
    </template>

    <template #calorieBudgetKcal-cell="{ row }">
      <div class="flex flex-col items-end tabular-nums">
        <span class="font-semibold text-default">
          {{ Math.round(row.original.review.calorieBudgetKcal) }}
        </span>
        <ReviewDelta
          :value="row.original.delta?.calorieBudgetKcal ?? null"
          placeholder
        />
      </div>
    </template>

    <template #trendWeightKg-cell="{ row }">
      <div class="flex flex-col items-end tabular-nums">
        <span class="text-default">
          {{ row.original.review.trendWeightKg.toFixed(1) }}
        </span>
        <ReviewDelta
          :value="row.original.delta?.trendWeightKg ?? null"
          :decimals="1"
          placeholder
        />
      </div>
    </template>

    <template #maintenanceKcal-cell="{ row }">
      <div class="flex flex-col items-end tabular-nums">
        <span class="text-default">
          {{ Math.round(row.original.review.maintenanceKcal) }}
        </span>
        <ReviewDelta
          :value="row.original.delta?.maintenanceKcal ?? null"
          placeholder
        />
      </div>
    </template>

    <template #proteinFloorG-cell="{ row }">
      <div class="flex flex-col items-end tabular-nums">
        <span class="text-default">
          {{ Math.round(row.original.review.proteinFloorG) }}
        </span>
        <ReviewDelta
          :value="row.original.delta?.proteinFloorG ?? null"
          placeholder
        />
      </div>
    </template>
  </UTable>

  <ul v-else role="list" class="flex flex-col gap-3">
    <li v-for="row in rows" :key="row.review.id">
      <ReviewLedgerItem :row="row" />
    </li>
  </ul>
</template>
