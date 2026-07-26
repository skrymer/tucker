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

// The portion the screen is stated at. 100 g is the default because no provider
// serving size is trustworthy enough to beat it (ADR 0022), and the track stops
// at 250 g rather than the day's allowance — a track running to four digits
// would bury the 10–100 g zone where real portions live.
const DEFAULT_PORTION_G = 100
const MIN_PORTION_G = 10
const MAX_PORTION_G = 250
const PORTION_STEP_G = 5

// Grams to one decimal, without a trailing `.0`. Whole grams would round a 6.3 g
// protein spread to 6 and a 0.4 g drink to 0, which is most of what it returns.
const oneDecimal = (g: number) => String(Number(g.toFixed(1)))

/** The portion every figure about the food is stated at. */
function usePortion() {
  const grams = ref(DEFAULT_PORTION_G)
  // A portion is dialled for the product in the user's hand, so a different
  // product starts over rather than inheriting it. `check.vue` happens to
  // unmount this component between scans, which resets the ref anyway — this
  // keeps the guarantee a property of the component's own props rather than of
  // how one parent currently renders it.
  watch(
    () => props.check,
    () => {
      grams.value = DEFAULT_PORTION_G
    },
  )
  return { grams, label: computed(() => formatGrams(grams.value)) }
}
const { grams: portionG, label: portionLabel } = usePortion()

/**
 * A share drawn as a ring: the whole percentage, the arc sweep, and the faint
 * track derived from the arc's own colour so re-skinning a role can never leave
 * the track on a stale hue (frontend/DESIGN.md).
 *
 * Past a full circle the two stop agreeing, deliberately: the arc caps at 100%
 * (`ringFraction` — an over-target reading is a full ring, never an overshoot)
 * while the percentage keeps counting. A 250 g portion of something dense can
 * cost half the day again over, and rounding that down to "100%" would understate
 * it; the pair beneath the ring names the excess in kcal either way.
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
 * A per-100 g figure restated at the chosen portion. Cost and return are both
 * linear in grams, so scaling an already-derived share is presentation in the
 * same class as the Day Ring's arc sweep, not a rule re-derived in Vue
 * (ADR 0022, ADR 0002).
 */
const inPortion = (per100g: number) => (per100g * portionG.value) / 100

/**
 * The two peer rings: what the portion costs against the Calorie Budget and what
 * it returns against the Protein Floor. Cost keeps the calorie green even when it
 * is most of the Budget — red would read as *over budget*, a verdict about a day
 * that has not happened (ADR 0022).
 */
function useRings() {
  return computed(() => [
    {
      key: 'cost',
      label: 'Costs',
      line: `${Math.round(inPortion(props.check.caloriesPer100g))} / ${Math.round(props.check.calorieBudgetKcal)} kcal`,
      ...ring(inPortion(props.check.costSharePer100g), 'var(--ui-primary)'),
    },
    {
      key: 'return',
      label: 'Returns',
      line: `${oneDecimal(inPortion(props.check.proteinPer100g))} / ${Math.round(props.check.proteinFloorG)} g protein`,
      ...ring(inPortion(props.check.returnSharePer100g), 'var(--ui-secondary)'),
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
  // whether anything is owed (it floors the figure at zero), and scaling a
  // positive figure by a positive portion keeps it positive: which sentence the
  // user gets is the food's character, so it can never flip as the dial moves.
  const balance = computed(() => {
    const owed = inPortion(props.check.balanceProteinPer100gG)
    if (owed <= 0) return 'Keeps pace on its own.'
    // A tenth of a gram is the finest figure worth stating, and a small enough
    // portion of a food near pace falls under it — "with 0 g" would deny the
    // debt the same sentence has just asserted. Asking the formatter what it
    // would print keeps the boundary in one place instead of hard-coding the
    // 0.05 that happens to be where it rounds to nothing today.
    const rounded = oneDecimal(owed)
    const amount = rounded === '0' ? 'under 0.1' : rounded
    return `Balance ${portionLabel.value} with ${amount} g of protein elsewhere today.`
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
  // "0 g carbs" would be a claim nobody made about the product. The grams are
  // the portion's, so protein reads the same here as it does under its own ring;
  // the widths are shares of the food's own calories and so never move.
  const label = (grams: number | null | undefined, macro: string) =>
    grams == null
      ? `${macro} unknown`
      : `${oneDecimal(inPortion(grams))} g ${macro}`
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

    <!-- The dial the rings answer to. The live figure sits with the control that
         changes it, so a thumb at the bottom of a phone never has to look to the
         top of the screen to read what it just set. Nuxt UI hardcodes the slider
         thumb's accessible name to "Thumb", so the group carries the real one:
         the readout the thumb drives, "Portion 100 g". -->
    <div class="w-full" role="group" aria-labelledby="check-portion-label">
      <p id="check-portion-label" class="flex items-baseline justify-between">
        <span class="text-xs font-semibold tracking-wide text-dimmed uppercase">
          Portion
        </span>
        <span
          class="font-display text-lg font-bold text-highlighted tabular-nums"
        >
          {{ portionLabel }}
        </span>
      </p>
      <USlider
        v-model="portionG"
        class="mt-2"
        :min="MIN_PORTION_G"
        :max="MAX_PORTION_G"
        :step="PORTION_STEP_G"
      />
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
