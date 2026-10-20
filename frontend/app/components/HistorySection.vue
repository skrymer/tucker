<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'
import type { CalendarGrid } from '~/utils/calendarGrid'

type LoggedDays = components['schemas']['LoggedDaysResponse']
type Reading = components['schemas']['WeightMeasurementResponse']

const props = defineProps<{
  /**
   * Whether the User counts calories: without it the card is weight alone.
   * Read once as the card mounts, so the Entries reads follow it only on a remount.
   */
  tracksCalories: boolean
}>()

const { $api } = useNuxtApp()

const today = useLocalDay()
const picked = ref(today.value)
const heading = computed(() => dayHeading(picked.value, today.value))
const plain = computed(() => formatDayHeadingFromISO(picked.value))
/**
 * The furthest day that holds anything: tomorrow, which an Entry can be logged
 * on (ADR 0035), or today for weight alone.
 */
const lastDay = computed(() =>
  props.tracksCalories ? localTomorrow(today.value) : today.value,
)

/** Every reading the User has taken, read once for the visit. */
function useReadings() {
  const {
    data,
    error,
    load: read,
  } = useOptionalFetch(() => $api('/api/weight'))
  /** Whether the first read has come back; until then no day is known empty. */
  const answered = ref(false)
  async function load() {
    await read()
    answered.value = true
  }
  const byDay = computed(
    () =>
      new Map<string, Reading>(
        (data.value ?? []).map((r) => [r.measuredOn, r]),
      ),
  )
  const days = computed(() => [...byDay.value.keys()])
  const pickedReading = computed(() => byDay.value.get(picked.value) ?? null)
  return { days, pickedReading, answered, error, load }
}
const readings = useReadings()
// Not awaited: a read nothing else on /review needs must not hold the page's
// Suspense, which waits on every awaited setup beneath it.
void readings.load()

/**
 * The days holding an Entry across the month the calendar draws, each month
 * read once for the visit.
 */
function useLoggedDays() {
  const read = new Map<string, LoggedDays>()
  const {
    selection: grid,
    data,
    error,
    load,
  } = useWindowedFetch<CalendarGrid | null, LoggedDays | null>(
    null,
    async (grid, signal) => {
      if (!grid) return null
      const known = read.get(grid.from)
      if (known) return known
      const answer = await $api('/api/entries/days', { query: grid, signal })
      read.set(grid.from, answer)
      return answer
    },
  )
  /** Asks about the grid the calendar draws: as it opens, and on every page. */
  function show(drawn: CalendarGrid) {
    grid.value = drawn
  }
  const days = computed(() => data.value?.days ?? [])
  return { show, days, error, load }
}
// Unasked with Calorie Tracking off: it reads a log Tucker has agreed to stop
// asking a weight-only User to keep.
const loggedDays = props.tracksCalories ? useLoggedDays() : null

/** The picked day's Entries, re-read whenever another day is picked. */
function usePickedDayEntries() {
  const {
    data: day,
    error,
    pending,
    load,
  } = useWindowedFetch(picked, (date, signal) =>
    $api('/api/entries', { query: { date }, signal }),
  )
  const entries = computed(() => day.value?.entries ?? [])
  const tally = computed(() =>
    formatDayTally(entries.value.length, day.value?.caloriesConsumed ?? 0),
  )
  /** Whether any day has been answered yet: until then the half claims nothing. */
  const answered = computed(() => day.value !== null)
  /** The day whose Entries are on screen: the last answered, while a newly picked one loads. */
  const shown = computed(() => day.value?.date ?? picked.value)
  return { entries, tally, answered, shown, error, pending, load }
}
const dayEntries = props.tracksCalories ? usePickedDayEntries() : null
void dayEntries?.load()

/** Both halves failing reads as one broken card, with one Retry for every failed read. */
function useCardError() {
  const entriesError = computed(
    () => dayEntries?.error.value || loggedDays?.error.value,
  )
  const cardError = computed(() =>
    readings.error.value && entriesError.value ? readings.error.value : null,
  )
  function retryCard() {
    void readings.load()
    if (dayEntries?.error.value) void dayEntries.load()
    if (loggedDays?.error.value) void loggedDays.load()
  }
  return { cardError, retryCard }
}
const { cardError, retryCard } = useCardError()

const emit = defineEmits<{
  /** Passed on from the weight half: a reading was saved or deleted. */
  changed: []
}>()

async function readingsChanged() {
  emit('changed')
  await readings.load()
}
</script>

<template>
  <UCard role="region" aria-labelledby="history-heading">
    <h2 id="history-heading" class="text-h2 text-highlighted">History</h2>
    <LoadErrorState
      :error="cardError"
      title="Couldn't load this card"
      nested
      class="mt-3"
      @retry="retryCard"
    />
    <!-- Hidden rather than unmounted, so the calendar keeps the month it was
         showing through a failure and its retry. -->
    <div v-show="!cardError">
      <AppCalendar
        v-model="picked"
        :max="lastDay"
        :weighed="readings.days.value"
        :logged="loggedDays?.days.value"
        class="mt-3"
        @shown="loggedDays?.show"
      />
      <!-- Its own error, under a calendar still in use: without its dots every
           day can still be picked. -->
      <LoadErrorState
        v-if="loggedDays"
        :error="loggedDays.error.value"
        title="Couldn't load logged days"
        nested
        class="mt-3"
        @retry="loggedDays.load"
      />
      <USeparator class="my-3" />
      <section aria-labelledby="history-day">
        <h3
          id="history-day"
          class="flex items-center gap-2 text-h2 text-highlighted"
        >
          <UIcon
            name="i-lucide-calendar"
            class="size-5 text-muted"
            aria-hidden
          />
          {{ heading }}
        </h3>
        <HistoryWeight
          :day="picked"
          :reading="readings.pickedReading.value"
          :today="today"
          :answered="readings.answered.value"
          :error="readings.error.value"
          class="mt-2"
          @changed="readingsChanged"
          @retry="readings.load"
        />
        <!-- A newly picked day keeps the last answer up, dimmed; ADR 0007's
             150 ms delay sits in the transition, so a read answered faster
             than that never dims. -->
        <section
          v-if="dayEntries"
          aria-labelledby="history-entries"
          :aria-busy="dayEntries.pending.value"
          class="mt-4 transition-opacity delay-150"
          :class="
            dayEntries.pending.value &&
            dayEntries.answered.value &&
            'opacity-50'
          "
        >
          <!-- On a narrow phone the tally drops under the label rather than
               either breaking mid-phrase. -->
          <div
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
          >
            <h4 id="history-entries" class="text-label text-muted">Entries</h4>
            <p
              v-if="dayEntries.entries.value.length"
              class="text-sm text-muted tabular-nums"
            >
              {{ dayEntries.tally.value }}
            </p>
          </div>
          <LoadErrorState
            :error="dayEntries.error.value"
            :title="`Couldn't load ${plain}`"
            nested
            class="mt-2"
            @retry="dayEntries.load"
          >
            <!-- The first read only (ADR 0007's cold load); a later pick keeps
                 the last answer up instead. Decorative, so hidden: the
                 section's aria-busy already says it is loading, and each
                 USkeleton would otherwise raise an alert. -->
            <ul
              v-if="!dayEntries.answered.value"
              aria-hidden="true"
              data-testid="day-skeleton"
              class="appear-late mt-2 divide-y divide-default"
            >
              <li
                v-for="width in ['w-2/5', 'w-1/3', 'w-1/2']"
                :key="width"
                class="flex flex-col gap-1.5 py-2.5"
              >
                <USkeleton class="h-4" :class="width" />
                <USkeleton class="h-3 w-3/5" />
              </li>
            </ul>
            <p
              v-else-if="!dayEntries.entries.value.length"
              class="text-sm text-muted"
            >
              Nothing logged.
            </p>
            <!-- Read-only on every day: deletion stays on Today. Keyed by the
                 day, so each newly shown one opens collapsed. -->
            <CappedEntryList
              v-else
              :key="dayEntries.shown.value"
              :entries="dayEntries.entries.value"
              class="mt-2"
            />
          </LoadErrorState>
        </section>
      </section>
    </div>
  </UCard>
</template>
