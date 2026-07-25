<script setup lang="ts">
// A Check, stated (ADR 0022). Every figure here is backend-derived; the component
// formats and draws, and never judges — no verdict word, grade or traffic light.
// The two arcs sit at equal radius on purpose (frontend/DESIGN.md): a Check
// compares cost against return, and the Day Ring's nested radii would draw equal
// shares as unequal lengths.
import type { components } from '#open-fetch-schemas/api'

type Check = components['schemas']['CheckResponse']

const props = defineProps<{ check: Check }>()

const RING_RADIUS = 72
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

// Grams to one decimal, without a trailing `.0`. Whole grams would round a 6.3 g
// protein spread to 6 and a 0.4 g drink to 0, which is most of what it returns.
const oneDecimal = (g: number) => String(Number(g.toFixed(1)))

/**
 * A share drawn as a ring: the whole percentage, the arc sweep, and the faint
 * track derived from the arc's own colour so re-skinning a role can never leave
 * the track on a stale hue (frontend/DESIGN.md).
 */
function ring(share: number, stroke: string) {
  return {
    stroke,
    track: `color-mix(in srgb, ${stroke} 15%, transparent)`,
    percent: `${Math.round(share * 100)}%`,
    offset: ringDashOffset(share, 1, RING_RADIUS),
  }
}

/**
 * The two peer rings: what 100 g costs against the Calorie Budget and what it
 * returns against the Protein Floor. Cost keeps the calorie green even when it
 * is most of the Budget — red would read as *over budget*, a verdict about a day
 * that has not happened (ADR 0022).
 */
function useRings() {
  return computed(() => [
    {
      key: 'cost',
      label: 'Costs',
      line: `${Math.round(props.check.caloriesPer100g)} / ${Math.round(props.check.calorieBudgetKcal)} kcal`,
      ...ring(props.check.costSharePer100g, 'var(--ui-primary)'),
    },
    {
      key: 'return',
      label: 'Returns',
      line: `${oneDecimal(props.check.proteinPer100g)} / ${Math.round(props.check.proteinFloorG)} g protein`,
      ...ring(props.check.returnSharePer100g, 'var(--ui-secondary)'),
    },
  ])
}
const rings = useRings()

/**
 * The food's character, which no portion changes: cost and return both scale
 * with grams, so their ratio cancels grams entirely (ADR 0022). Stating pace
 * beside it answers the question the figures raise — *your targets moved, not
 * the food* — without ever grading the food.
 */
function usePaceLine() {
  const foodFigure = computed(() =>
    props.check.proteinPer100Kcal == null
      ? null
      : `${oneDecimal(props.check.proteinPer100Kcal)} g protein per 100 kcal`,
  )
  // Pace is only worth stating beside a figure it can be compared with; on its
  // own it is a number with nothing to measure. The template guards both on
  // `foodFigure`, so this needs no null branch of its own.
  const dayNeeds = computed(
    () => `your day needs ${oneDecimal(props.check.paceGPer100Kcal)}`,
  )
  // What the rest of the day has to make up for this portion — a consequence of
  // the user's own targets, not a criticism of the food. The backend decides
  // whether anything is owed (it floors the figure at zero); the test here is on
  // the *rounded* value, so the sentence never contradicts the number it shows.
  const balance = computed(() => {
    const owed = Math.round(props.check.balanceProteinPer100gG)
    return owed > 0
      ? `Balance 100 g with ${owed} g of protein elsewhere today.`
      : 'Keeps pace on its own.'
  })
  return { foodFigure, dayNeeds, balance }
}
const { foodFigure, dayNeeds, balance } = usePaceLine()

/**
 * A whole day of nothing but this product. Both figures are absent for a Food
 * with no calories, where no amount of it exhausts the Budget.
 */
const allowanceLine = computed(() => {
  const { gramsInBudget, wholeDayProteinShortfallG } = props.check
  if (gramsInBudget == null) return null
  const fits = `A whole day of it is ${formatGrams(gramsInBudget)}`
  const short = Math.round(wholeDayProteinShortfallG ?? 0)
  return short > 0
    ? `${fits} — and still ${short} g under your protein floor.`
    : `${fits}, and your protein floor would be covered.`
})

/**
 * The composition bar. Protein carries the coral it has everywhere else; carbs
 * and fat are deliberately neutral, because protein is the only macro Tucker
 * sets a target for and the palette should not imply otherwise (CONTEXT.md —
 * diet-agnostic). Each segment states its own grams, so none is colour-alone.
 */
function useMacroBar() {
  const width = (share: number | null | undefined) =>
    `${((share ?? 0) * 100).toFixed(1)}%`
  // A macro the source never supplied is absent, not zero (ADR 0006) — saying
  // "0 g carbs" would be a claim nobody made about the product.
  const label = (grams: number | null | undefined, macro: string) =>
    grams == null ? `${macro} unknown` : `${oneDecimal(grams)} g ${macro}`
  return computed(() => [
    {
      key: 'protein',
      label: label(props.check.proteinPer100g, 'protein'),
      fill: 'bg-secondary',
      width: width(props.check.proteinEnergyShare),
    },
    {
      key: 'carbs',
      label: label(props.check.carbsPer100g, 'carbs'),
      fill: 'bg-neutral-300 dark:bg-neutral-600',
      width: width(props.check.carbsEnergyShare),
    },
    {
      key: 'fat',
      label: label(props.check.fatPer100g, 'fat'),
      fill: 'bg-neutral-400 dark:bg-neutral-500',
      width: width(props.check.fatEnergyShare),
    },
  ])
}
const macros = useMacroBar()
</script>

<template>
  <div class="flex flex-col items-center gap-5">
    <div class="flex justify-center gap-6">
      <div
        v-for="r in rings"
        :key="r.key"
        class="flex flex-col items-center gap-2"
      >
        <p class="text-xs font-semibold tracking-wide text-dimmed uppercase">
          {{ r.label }}
        </p>
        <div class="relative size-32">
          <svg
            class="-rotate-90"
            width="128"
            height="128"
            viewBox="0 0 176 176"
            aria-hidden="true"
          >
            <circle
              cx="88"
              cy="88"
              r="72"
              fill="none"
              :stroke="r.track"
              stroke-width="15"
            />
            <circle
              cx="88"
              cy="88"
              r="72"
              fill="none"
              :stroke="r.stroke"
              stroke-width="15"
              stroke-linecap="round"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="r.offset"
            />
          </svg>
          <div class="absolute inset-0 grid place-content-center">
            <span
              class="font-display text-3xl font-extrabold text-highlighted tabular-nums"
            >
              {{ r.percent }}
            </span>
          </div>
        </div>
        <p class="text-xs text-muted tabular-nums">{{ r.line }}</p>
      </div>
    </div>

    <!-- The food's character, which no portion changes. The whole card hangs on
         the pace ratio: with no calories there is none, and stating a conclusion
         drawn from a comparison we just withheld would read as a verdict on a
         product we deliberately declined to measure (ADR 0022). -->
    <div
      v-if="foodFigure"
      class="w-full rounded-lg bg-elevated/50 p-3 text-center"
    >
      <p class="text-sm text-default tabular-nums">{{ foodFigure }}</p>
      <p class="mt-0.5 text-xs text-muted tabular-nums">{{ dayNeeds }}</p>
      <p class="mt-2 text-xs text-muted tabular-nums">{{ balance }}</p>
    </div>

    <p v-if="allowanceLine" class="text-center text-sm text-muted tabular-nums">
      {{ allowanceLine }}
    </p>

    <!-- Composition, stated and unjudged. -->
    <div class="w-full">
      <div class="flex h-3 overflow-hidden rounded-full bg-elevated">
        <div
          v-for="macro in macros"
          :key="macro.key"
          :class="macro.fill"
          :style="{ width: macro.width }"
        />
      </div>
      <div class="mt-2 flex justify-between text-xs text-muted tabular-nums">
        <span v-for="macro in macros" :key="macro.key">{{ macro.label }}</span>
      </div>
    </div>

    <!-- ODbL attribution: these figures belong to whoever supplied them
         (ADR 0006). A Food from the user's own catalog owes none. -->
    <p v-if="check.source" class="text-xs text-dimmed">
      Data from {{ check.source }}
    </p>
  </div>
</template>
