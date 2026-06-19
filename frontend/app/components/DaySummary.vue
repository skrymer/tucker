<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  summary: components['schemas']['DailySummaryResponse']
}>()

const emit = defineEmits<{
  delete: [components['schemas']['EntryResponse']]
}>()

// Budget and floor are absent until the first weekly review has run.
const hasBudget = computed(() => props.summary.calorieBudget != null)

// The earned day verdict, or null for an in-progress or pre-review day that has
// none — the progress bars carry the numbers instead. Presentation mapping lives
// in the shared util, alongside its drift/pace siblings.
const verdict = computed(() =>
  dayStatusVerdict(props.summary.dayStatus as DayStatus | undefined),
)

// The headroom readouts beneath each headline: how much budget / floor is left,
// and the cosmetic colour each bar ramps to. The signed remaining figures are
// backend-sourced (ADR 0002); only the bar colour is a frontend presentation cue.
function useHeadroom() {
  const caloriesRemaining = computed(() => props.summary.caloriesRemaining ?? 0)
  const caloriesOver = computed(() => caloriesRemaining.value < 0)
  const caloriesRemainingLabel = computed(() =>
    caloriesOver.value
      ? `${Math.round(-caloriesRemaining.value)} kcal over`
      : `${Math.round(caloriesRemaining.value)} kcal left`,
  )
  const proteinRemaining = computed(() => props.summary.proteinRemaining ?? 0)
  const proteinRemainingLabel = computed(() =>
    proteinRemaining.value > 0
      ? `${Math.round(proteinRemaining.value)} g to go`
      : 'floor met',
  )
  // The bar's fill is capped at its target, so an over-target day shows a full
  // bar rather than passing UProgress a value beyond its max. The colour ramps
  // below read the *uncapped* figures, so the headroom thresholds are unaffected.
  const caloriesBarValue = computed(() =>
    Math.min(props.summary.caloriesConsumed, props.summary.calorieBudget ?? 1),
  )
  const proteinBarValue = computed(() =>
    Math.min(props.summary.proteinConsumed, props.summary.proteinFloor ?? 1),
  )
  // Cosmetic headroom ramps (issue #133): green→yellow→red on the calorie bar as
  // the budget runs out, the reverse on the protein bar as the floor fills.
  const caloriesColor = computed(() =>
    caloriesBarColor(caloriesRemaining.value, props.summary.calorieBudget ?? 1),
  )
  const proteinColor = computed(() =>
    proteinBarColor(
      props.summary.proteinConsumed,
      props.summary.proteinFloor ?? 1,
    ),
  )
  return {
    caloriesOver,
    caloriesRemainingLabel,
    proteinRemainingLabel,
    caloriesBarValue,
    proteinBarValue,
    caloriesColor,
    proteinColor,
  }
}

const {
  caloriesOver,
  caloriesRemainingLabel,
  proteinRemainingLabel,
  caloriesBarValue,
  proteinBarValue,
  caloriesColor,
  proteinColor,
} = useHeadroom()

// Cap the day's entries so the ledger never buries the at-a-glance numbers or
// the Log-entry action. Entries arrive oldest-first (ORDER BY id), so the most
// recent few — including a just-logged one — are the visible tail; the rest fold
// behind a "Show all" expander.
function useEntryLog() {
  const VISIBLE = 3
  const expanded = ref(false)
  const entries = computed(() => props.summary.entries)
  const canExpand = computed(() => entries.value.length > VISIBLE)
  const visibleEntries = computed(() =>
    expanded.value ? entries.value : entries.value.slice(-VISIBLE),
  )
  const toggle = () => {
    expanded.value = !expanded.value
  }
  return { expanded, visibleEntries, canExpand, toggle }
}

const { expanded, visibleEntries, canExpand, toggle } = useEntryLog()
</script>

<template>
  <div class="flex flex-col gap-4">
    <UCard v-if="hasBudget">
      <h2 class="text-sm font-medium text-muted">Calories</h2>
      <p class="mt-1 text-2xl font-bold text-default">
        {{ Math.round(summary.caloriesConsumed) }} /
        {{ Math.round(summary.calorieBudget ?? 0) }} kcal
      </p>
      <p
        class="mt-1 text-sm"
        :class="caloriesOver ? 'text-error' : 'text-muted'"
      >
        {{ caloriesRemainingLabel }}
      </p>
      <UProgress
        class="mt-3"
        :model-value="caloriesBarValue"
        :max="summary.calorieBudget ?? 1"
        :color="caloriesColor"
        aria-label="Calories consumed against the Calorie Budget"
      />

      <h2 class="mt-6 text-sm font-medium text-muted">Protein</h2>
      <p class="mt-1 text-2xl font-bold text-default">
        {{ Math.round(summary.proteinConsumed) }} /
        {{ Math.round(summary.proteinFloor ?? 0) }} g protein
      </p>
      <p class="mt-1 text-sm text-muted">{{ proteinRemainingLabel }}</p>
      <UProgress
        class="mt-3"
        :model-value="proteinBarValue"
        :max="summary.proteinFloor ?? 1"
        :color="proteinColor"
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
          v-for="entry in visibleEntries"
          :key="entry.id"
          class="flex items-center justify-between gap-2 py-2"
        >
          <span class="min-w-0 text-default">
            {{ formatEntryName(entry) }}
          </span>
          <div class="flex shrink-0 items-center gap-1">
            <UBadge
              v-if="entry.isEstimate"
              color="warning"
              variant="subtle"
              size="xs"
            >
              est.
            </UBadge>
            <UButton
              :aria-label="`Delete ${formatEntryName(entry)}`"
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              square
              class="size-9 text-muted hover:text-default"
              :ui="{ base: 'justify-center' }"
              @click="emit('delete', entry)"
            />
          </div>
        </li>
      </ul>

      <UButton
        v-if="canExpand"
        variant="ghost"
        color="neutral"
        size="sm"
        block
        class="mt-2"
        @click="toggle"
      >
        {{ expanded ? 'Show less' : `Show all ${summary.entries.length}` }}
      </UButton>
    </UCard>
  </div>
</template>
