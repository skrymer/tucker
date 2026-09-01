<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  breakdown: components['schemas']['IntakeBreakdownResponse']
  /** Whether a wider (or narrower) window is on its way. */
  pending?: boolean
}>()

/**
 * Which window is being asked about. Owned by the page, which turns it into the
 * request; the section only offers the choice.
 */
// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const period = defineModel<BreakdownPeriod>('period', { default: 'today' })

const periodItems: TabsItem[] = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: 'week' },
]

// An empty window keeps the section rather than hiding it (ADR 0026) — there is
// nothing to draw a ring from, so it says so.
const isEmpty = computed(() => props.breakdown.items.length === 0)

/** How far the figures can be trusted: how much of the window was actually logged. */
const coverage = computed(() =>
  loggedDaysCaption(
    props.breakdown.loggedDays,
    props.breakdown.from,
    props.breakdown.to,
  ),
)

const legend = computed(() => intakeLegend(props.breakdown.items))

/** Other's tail, hidden until asked for and hidden again on a second press. */
function useTail() {
  const { expanded, label, toggle, collapse } = useExpander(
    () => legend.value.folded.length,
  )
  // Keyed to the breakdown's own bounds rather than to `period`: a new window is
  // a new answer and opens folded, the way its ring draws, while a retry of the
  // same one leaves a tail the User opened where they left it. Two sources rather
  // than one getter returning both — an array built in the getter is a fresh
  // object every run, so it would read as changed on a reload of the same window.
  watch([() => props.breakdown.from, () => props.breakdown.to], collapse)

  const rows = computed(() =>
    expanded.value
      ? [...legend.value.slices, ...legend.value.folded]
      : legend.value.slices,
  )
  return { expanded, expanderLabel: label, rows, toggle }
}
const { expanded, expanderLabel, rows, toggle } = useTail()

/**
 * The slice under the pointer, read out in the middle of the ring.
 *
 * Sticky on purpose: it holds the last slice rather than clearing, so a tap on a
 * phone — which has no hover to leave — leaves something to read.
 */
function useFocus() {
  const pointedAt = ref<{ name: string; calories: number } | null>(null)

  /**
   * Take the segment the chart reports. Its `tooltip` slot is the only place it
   * says which one that is, so the slot is where the card learns it; the slot
   * draws nothing, and the empty string it returns is what the chart puts in its
   * own tooltip box, which is made invisible in `main.css`.
   */
  function focusOn(values: Record<string, unknown> | null): string {
    const name = typeof values?.label === 'string' ? values.label : null
    pointedAt.value =
      name === null ? null : { name, calories: Number(values?.[name]) }
    return ''
  }

  // Matched on both, not on the name alone: an Estimated Entry slices by a label
  // the User typed, so two slices can share a name and only their figures tell
  // them apart.
  const focused = computed(() =>
    legend.value.slices.find(
      (row) =>
        row.name === pointedAt.value?.name &&
        row.calories === pointedAt.value?.calories,
    ),
  )
  return { focused, focusOn }
}
const { focused, focusOn } = useFocus()

/**
 * The ring itself. Sized by calories rather than share so it is the response's own
 * figures being drawn; the two are proportional. `duration: 0` because the enter
 * animation is a d3 transition that freezes part-way through whenever the tab is
 * not the focused window, leaving the ring at a few percent opacity.
 */
function useRing() {
  const data = computed(() => legend.value.slices.map((row) => row.calories))
  const categories = computed(() =>
    Object.fromEntries(
      legend.value.slices.map((row) => [
        row.key,
        { name: row.name, color: row.color },
      ]),
    ),
  )
  return { data, categories }
}
const { data: ringData, categories: ringCategories } = useRing()
</script>

<template>
  <UCard
    role="region"
    aria-labelledby="intake-breakdown-heading"
    :aria-busy="pending"
  >
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

    <div
      class="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
    >
      <!-- `role`/`aria-label` land on the root, not on the tablist Reka renders
           inside it, so the name is carried by a group around the tabs rather
           than by the tablist itself. -->
      <UTabs
        v-model="period"
        :items="periodItems"
        :content="false"
        variant="pill"
        size="xs"
        color="primary"
        role="group"
        aria-label="Period"
      />
      <span v-if="coverage" class="text-sm text-muted">{{ coverage }}</span>
    </div>

    <p v-if="isEmpty" class="mt-3 text-sm text-muted">Nothing logged yet</p>

    <!-- The toggle moves at once while the figures below it are still the
         previous window's, so a load in flight is said rather than left to be
         misread as a week that happens to look like a day. Delayed by ADR 0007's
         150 ms, in the transition rather than in a timer: a switch answered
         faster than that is over before the dim begins, so it never flashes. -->
    <div
      v-else
      class="mt-3 flex flex-col items-center gap-6 transition-opacity delay-150 sm:flex-row"
      :class="pending && 'opacity-50'"
    >
      <!-- Decorative: every figure it encodes is in the legend beside it, and
           three of the palette's light hues sit under 3:1, so the labelled rows
           are what make it readable at all (frontend/DESIGN.md). -->
      <div aria-hidden="true" class="intake-ring w-45 shrink-0">
        <DonutChart
          :data="ringData"
          :categories="ringCategories"
          :height="180"
          :arc-width="26"
          :radius="2"
          :duration="0"
          :show-background="false"
          hide-legend
        >
          <!-- Drawn dead-centre of the ring by the chart itself. -->
          <template #default>
            <p v-if="focused" class="max-w-32 text-center">
              <span class="block truncate text-sm font-medium text-default">
                {{ focused.name }}
              </span>
              <span class="block text-xs text-muted">
                {{ formatIntakeFigures(focused.calories, focused.protein) }}
              </span>
            </p>
          </template>
          <template #tooltip="{ values }">{{ focusOn(values) }}</template>
        </DonutChart>
      </div>

      <ul class="w-full divide-y divide-default">
        <li
          v-for="row in rows"
          :key="row.key"
          class="flex items-baseline justify-between gap-3 py-2"
          :class="row.kind === 'folded' && 'pl-4'"
        >
          <div class="min-w-0">
            <p class="flex items-baseline gap-1.5 font-medium text-default">
              <span
                v-if="row.color"
                aria-hidden="true"
                class="size-2.5 shrink-0 self-center rounded-full"
                :style="{ backgroundColor: row.color }"
              />
              <span class="truncate">{{ row.name }}</span>
              <span
                v-if="row.count"
                class="shrink-0 text-sm font-normal text-muted"
              >
                {{ row.count }} {{ row.count === 1 ? 'item' : 'items' }}
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
          <span class="flex shrink-0 items-baseline gap-2">
            <span class="font-semibold tabular-nums text-default">
              {{ Math.round(row.share * 100) }}%
            </span>
            <!-- The tail opens in place, off the response already held. -->
            <UButton
              v-if="row.kind === 'other'"
              :label="expanderLabel"
              :trailing-icon="
                expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
              "
              :aria-expanded="expanded"
              color="neutral"
              variant="link"
              size="xs"
              class="p-0"
              @click="toggle"
            />
          </span>
        </li>
      </ul>
    </div>
  </UCard>
</template>
