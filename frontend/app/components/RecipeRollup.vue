<script setup lang="ts">
// The live "Per 100 g" preview of a recipe under construction. Cooking only
// moves water, so the batch total is re-expressed per 100 g of the finished
// dish (CONTEXT.md). Presentation only — the backend rolls up authoritatively
// on save (ADR 0002).
import type { RollupIngredient } from '~/utils/recipeRollup'

const props = defineProps<{
  lines: RollupIngredient[]
  cookedWeightG?: number
}>()

const rollup = computed(() =>
  rollupRecipe(props.lines, props.cookedWeightG ?? 0),
)

const cookDownPct = computed(() =>
  cookDownPercent(rollup.value.rawSumG, props.cookedWeightG ?? 0),
)
</script>

<template>
  <section
    aria-label="Per 100 g"
    class="flex flex-col gap-2 rounded-xl bg-elevated/50 p-4"
  >
    <p class="text-label text-muted">Per 100 g</p>
    <div class="flex items-baseline gap-4">
      <p class="text-stat text-primary">
        {{ Math.round(rollup.per100gKcal) }} kcal
      </p>
      <p class="text-stat text-secondary">
        {{ Math.round(rollup.per100gProtein) }} g protein
      </p>
    </div>
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between text-xs text-muted">
        <span>{{ Math.round(rollup.rawSumG) }} g raw</span>
        <span>{{ Math.round(cookedWeightG ?? 0) }} g cooked</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          class="h-full rounded-full bg-primary/60 transition-[width]"
          :style="{ width: cookDownPct + '%' }"
        />
      </div>
    </div>
  </section>
</template>
