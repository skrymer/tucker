<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  summary: components['schemas']['DailySummaryResponse']
}>()

// Budget and floor are absent until the first weekly review has run.
const hasBudget = computed(() => props.summary.calorieBudget != null)

// The earned day verdict, or null for an in-progress or pre-review day that has
// none — the progress bars carry the numbers instead. Presentation mapping lives
// in the shared util, alongside its drift/pace siblings.
const verdict = computed(() =>
  dayStatusVerdict(props.summary.dayStatus as DayStatus | undefined),
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <UCard v-if="hasBudget">
      <h2 class="text-sm font-medium text-muted">Calories</h2>
      <p class="mt-1 text-2xl font-bold text-default">
        {{ Math.round(summary.caloriesConsumed) }} /
        {{ Math.round(summary.calorieBudget ?? 0) }} kcal
      </p>
      <UProgress
        class="mt-3"
        :value="summary.caloriesConsumed"
        :max="summary.calorieBudget ?? 1"
        :color="caloriesBarColor(summary.dayStatus as DayStatus | undefined)"
        aria-label="Calories consumed against the Calorie Budget"
      />

      <h2 class="mt-6 text-sm font-medium text-muted">Protein</h2>
      <p class="mt-1 text-2xl font-bold text-default">
        {{ Math.round(summary.proteinConsumed) }} /
        {{ Math.round(summary.proteinFloor ?? 0) }} g protein
      </p>
      <UProgress
        class="mt-3"
        :value="summary.proteinConsumed"
        :max="summary.proteinFloor ?? 1"
        aria-label="Protein consumed against the Protein Floor"
      />

      <div v-if="verdict" class="mt-6 border-t border-default pt-3">
        <p
          :class="[
            'flex items-center gap-2 text-sm font-medium',
            verdict.class,
          ]"
        >
          <UIcon :name="verdict.icon" class="size-4" aria-hidden />
          {{ verdict.label }}
        </p>
      </div>
    </UCard>

    <UCard v-else>
      <p class="text-2xl font-bold text-default">
        {{ Math.round(summary.caloriesConsumed) }} kcal,
        {{ Math.round(summary.proteinConsumed) }} g protein
      </p>
      <p class="mt-2 text-sm text-muted">
        No budget yet — log your weight and run a weekly review.
      </p>
    </UCard>

    <UCard v-if="summary.entries.length">
      <h2 class="text-sm font-medium text-muted">Today's entries</h2>
      <ul class="mt-2 divide-y divide-default">
        <li
          v-for="entry in summary.entries"
          :key="entry.id"
          class="flex items-center justify-between gap-2 py-2"
        >
          <span class="text-default">
            {{ entry.foodName ?? entry.label }} —
            {{ Math.round(entry.calories) }} kcal
          </span>
          <UBadge
            v-if="entry.isEstimate"
            color="warning"
            variant="subtle"
            size="xs"
          >
            est.
          </UBadge>
        </li>
      </ul>
    </UCard>
  </div>
</template>
