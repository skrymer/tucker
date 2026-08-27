<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  breakdown: components['schemas']['IntakeBreakdownResponse']
}>()

/** One row of the legend — the ring's accessible equivalent. */
interface LegendRow {
  key: string
  name: string
  /** How many Foods the row holds; null for every row but Other. */
  count: number | null
  calories: number
  protein: number | null | undefined
  share: number
  isEstimate: boolean
  color: string
}

// An empty window keeps the section rather than hiding it (ADR 0026) — there is
// nothing to draw a ring from, so it says so.
const isEmpty = computed(() => props.breakdown.items.length === 0)

/**
 * The ring's slices and the legend's rows are one list: past the palette's eighth
 * hue everything folds into one grey Other, because a ninth Food must never be
 * given an invented colour (ADR 0026).
 */
function useLegend() {
  const folded = computed(() => foldTail(props.breakdown.items))

  const rows = computed<LegendRow[]>(() => {
    const ringed = folded.value.ringItems.map((item, i) => ({
      key: `slot-${i}`,
      name: item.name,
      count: null,
      calories: item.calories,
      protein: item.protein,
      share: item.share,
      isEstimate: item.isEstimate,
      color: RING_SLOT_COLORS[i]!,
    }))
    const other = folded.value.other
    if (!other) return ringed
    return [
      ...ringed,
      {
        key: 'other',
        name: 'Other',
        count: other.count,
        calories: other.calories,
        protein: other.protein,
        share: other.share,
        isEstimate: false,
        color: OTHER_COLOR,
      },
    ]
  })

  return { rows }
}
const { rows } = useLegend()

/**
 * The ring itself. Sized by calories rather than share so it is the response's own
 * figures being drawn; the two are proportional. `duration: 0` because the enter
 * animation is a d3 transition that freezes part-way through whenever the tab is
 * not the focused window, leaving the ring at a few percent opacity.
 */
function useRing() {
  const data = computed(() => rows.value.map((row) => row.calories))
  const categories = computed(() =>
    Object.fromEntries(
      rows.value.map((row) => [row.key, { name: row.name, color: row.color }]),
    ),
  )
  return { data, categories }
}
const { data: ringData, categories: ringCategories } = useRing()
</script>

<template>
  <UCard role="region" aria-labelledby="intake-breakdown-heading">
    <div class="flex items-baseline justify-between gap-2">
      <h2 id="intake-breakdown-heading" class="text-sm font-medium text-muted">
        What you're eating
      </h2>
      <!-- The denominator, stated: every share below is of this, never of the
           Calorie Budget (ADR 0026). -->
      <span class="text-sm font-semibold tabular-nums text-default">
        {{ Math.round(breakdown.totalCalories) }} kcal
      </span>
    </div>

    <p v-if="isEmpty" class="mt-3 text-sm text-muted">Nothing logged yet</p>

    <div v-else class="mt-3 flex flex-col items-center gap-6 sm:flex-row">
      <!-- Decorative: every figure it encodes is in the legend beside it, and
           three of the palette's light hues sit under 3:1, so the labelled rows
           are what make it readable at all (frontend/DESIGN.md). -->
      <div aria-hidden="true" class="w-45 shrink-0">
        <DonutChart
          :data="ringData"
          :categories="ringCategories"
          :height="180"
          :arc-width="26"
          :radius="2"
          :duration="0"
          :show-background="false"
          hide-legend
          hide-tooltip
        />
      </div>

      <ul class="w-full divide-y divide-default">
        <li
          v-for="row in rows"
          :key="row.key"
          class="flex items-baseline justify-between gap-3 py-2"
        >
          <div class="min-w-0">
            <p class="flex items-baseline gap-1.5 font-medium text-default">
              <span
                aria-hidden="true"
                class="size-2.5 shrink-0 self-center rounded-full"
                :style="{ backgroundColor: row.color }"
              />
              <span class="truncate">{{ row.name }}</span>
              <span
                v-if="row.count"
                class="shrink-0 text-sm font-normal text-muted"
              >
                {{ row.count }} items
              </span>
              <UBadge
                v-if="row.isEstimate"
                color="warning"
                variant="subtle"
                size="xs"
              >
                est.
              </UBadge>
            </p>
            <p class="text-sm text-muted">
              {{ formatIntakeFigures(row.calories, row.protein) }}
            </p>
          </div>
          <span class="shrink-0 font-semibold tabular-nums text-default">
            {{ Math.round(row.share * 100) }}%
          </span>
        </li>
      </ul>
    </div>
  </UCard>
</template>
