<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'
import type { LedgerRow } from '~/utils/reviewLedger'

const props = defineProps<{
  reviews: components['schemas']['WeeklyReviewResponse'][]
}>()

const isDesktop = useIsDesktop()

// The history arrives oldest-first; toLedgerRows reverses it to newest-first and
// attaches each row's deltas. Both the table and the cards read it.
const rows = computed(() => toLedgerRows(props.reviews))

// Numeric columns are right-aligned so the stacked value + delta line up.
const numeric = { class: { th: 'text-right', td: 'text-right' } }

const REVIEWED: TableColumn<LedgerRow> = {
  id: 'reviewedOn',
  header: 'Reviewed',
}
const TREND: TableColumn<LedgerRow> = {
  id: 'trendWeightKg',
  header: 'Trend wt.',
  meta: numeric,
}

/** The Budget leads the calorie four: it is the figure the week is read for. */
const WITH_TARGETS: TableColumn<LedgerRow>[] = [
  REVIEWED,
  { id: 'basis', header: 'Basis' },
  { id: 'calorieBudgetKcal', header: 'Budget', meta: numeric },
  TREND,
  { id: 'maintenanceKcal', header: 'Maintenance', meta: numeric },
  { id: 'proteinFloorG', header: 'Protein floor', meta: numeric },
]

/**
 * The columns this history earns. The calorie four appear whenever *any* review
 * carries Intake Targets — read off the data, never off the current setting,
 * which would be wrong both ways: it would erase a currently-off User's real
 * history, and give a currently-on User columns of em-dashes over the weeks they
 * were not tracking.
 */
const columns = computed(() =>
  props.reviews.some((review) => review.intakeTargets != null)
    ? WITH_TARGETS
    : [REVIEWED, TREND],
)
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
      <LedgerBasisBadge
        placeholder
        :basis="row.original.review.intakeTargets?.maintenanceBasis"
      />
    </template>

    <template #calorieBudgetKcal-cell="{ row }">
      <LedgerFigure
        lead
        :value="row.original.review.intakeTargets?.calorieBudgetKcal"
        :delta="row.original.targetsDelta?.calorieBudgetKcal"
      />
    </template>

    <template #trendWeightKg-cell="{ row }">
      <LedgerFigure
        :value="row.original.review.trendWeightKg"
        :delta="row.original.trendDelta"
        :decimals="1"
      />
    </template>

    <template #maintenanceKcal-cell="{ row }">
      <LedgerFigure
        :value="row.original.review.intakeTargets?.maintenanceKcal"
        :delta="row.original.targetsDelta?.maintenanceKcal"
      />
    </template>

    <template #proteinFloorG-cell="{ row }">
      <LedgerFigure
        :value="row.original.review.intakeTargets?.proteinFloorG"
        :delta="row.original.targetsDelta?.proteinFloorG"
      />
    </template>
  </UTable>

  <ul v-else role="list" class="flex flex-col gap-3">
    <li v-for="row in rows" :key="row.review.id">
      <ReviewLedgerItem :row="row" />
    </li>
  </ul>
</template>
