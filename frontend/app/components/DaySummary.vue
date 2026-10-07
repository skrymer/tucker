<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  summary: components['schemas']['DailySummaryResponse']
}>()

// Budget and floor are absent until the first weekly review has run.
const hasBudget = computed(() => props.summary.calorieBudget != null)

// The earned day verdict, or null for an in-progress or pre-review day that has
// none — the Day Ring carries the numbers instead. Presentation mapping lives in
// the shared util, alongside its drift/pace siblings.
const verdict = computed(() => dayStatusVerdict(props.summary.dayStatus))

// A budget carried forward rather than corrected, and the one thing that would
// let the engine correct it. Quiet by design (ADR 0031): a held budget is stale
// rather than wrong-direction, and it recurs every week a user logs thinly.
// The lookup tolerates a reason this client does not know: the precached shell
// (ADR 0011) outlives the backend that serves it, and `/` must lose the line rather
// than the page. `reviewBasisBadge` reads the same map the same way.
const heldNote = computed(() =>
  props.summary.heldReason
    ? (HELD_REASON_COPY[props.summary.heldReason]?.remedy ?? null)
    : null,
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <UCard v-if="hasBudget">
      <DayRing
        :calories-consumed="summary.caloriesConsumed"
        :calorie-budget="summary.calorieBudget ?? 1"
        :calories-remaining="summary.caloriesRemaining ?? 0"
        :protein-consumed="summary.proteinConsumed"
        :protein-floor="summary.proteinFloor ?? 1"
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

      <p
        v-if="heldNote"
        class="mt-3 flex items-start gap-2 border-t border-default pt-3 text-sm text-muted"
      >
        <!-- Not a pause glyph: SuspendedDeficitBanner carries one on this same
             page, and both states can be live at once. -->
        <UIcon
          name="i-lucide-history"
          class="mt-0.5 size-4 shrink-0"
          aria-hidden
        />
        <span>Your calorie budget is being held steady. {{ heldNote }}</span>
      </p>
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
  </div>
</template>
