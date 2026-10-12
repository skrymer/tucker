<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type LoggedDays = components['schemas']['LoggedDaysResponse']

const { $api } = useNuxtApp()

/** The picked day and its Entries, re-read whenever another day is picked. */
function usePickedDay() {
  const {
    selection: picked,
    data: day,
    error,
    pending,
    load,
  } = useWindowedFetch(localToday(), (date, signal) =>
    $api('/api/entries', { query: { date }, signal }),
  )
  const entries = computed(() => day.value?.entries ?? [])
  const tally = computed(() =>
    formatDayTally(entries.value.length, day.value?.caloriesConsumed ?? 0),
  )
  /** Whether any day has been answered yet: until then the panel claims nothing. */
  const answered = computed(() => day.value !== null)
  /**
   * The day whose Entries are on screen. While a newly picked one loads the
   * last answer stays up, dimmed, so the panel keeps naming the day it shows.
   */
  const shown = computed(() => day.value?.date ?? picked.value)
  return { picked, shown, entries, tally, answered, error, pending, load }
}

/**
 * A day as Today names it, and the last day that can be picked — both follow
 * the clock, so a page left open past midnight moves on with it.
 */
function useDayNaming(day: Ref<string>) {
  const today = useLocalDay()
  const heading = computed(() => dayHeading(day.value, today.value))
  const plain = computed(() => formatDayHeadingFromISO(day.value))
  /** The furthest day an Entry can be logged on (ADR 0035). */
  const lastDay = computed(() => localTomorrow(today.value))
  return { heading, plain, lastDay }
}

/**
 * The days holding an Entry across the month the calendar draws, each month
 * read once for the visit.
 */
function useLoggedDays() {
  const read = new Map<string, LoggedDays>()
  const {
    selection: month,
    data,
    error,
    load,
  } = useWindowedFetch(localToday().slice(0, 7), async (month, signal) => {
    const known = read.get(month)
    if (known) return known
    const answer = await $api('/api/entries/days', {
      query: visibleGrid(month),
      signal,
    })
    read.set(month, answer)
    return answer
  })
  const days = computed(() => data.value?.days ?? [])
  const firstLoggedOn = computed(() => data.value?.firstLoggedOn ?? undefined)
  /** Whether the User has no Entry on any day. */
  const neverLogged = computed(() => data.value?.firstLoggedOn === null)
  return { month, days, firstLoggedOn, neverLogged, error, load }
}

const { picked, shown, entries, tally, answered, error, pending, load } =
  usePickedDay()
const loggedDays = useLoggedDays()
// Not awaited: a read nothing else on /review needs must not hold the page's
// Suspense, which waits on every awaited setup beneath it.
void load()
void loggedDays.load()
const { heading, plain, lastDay } = useDayNaming(shown)
</script>

<template>
  <UCard role="region" aria-labelledby="day-lookup-heading">
    <h2 id="day-lookup-heading" class="text-h2 text-highlighted">
      Look up a day
    </h2>
    <p v-if="loggedDays.neverLogged.value" class="mt-3 text-sm text-muted">
      Nothing logged yet
    </p>
    <AppCalendar
      v-else
      v-model="picked"
      :min="loggedDays.firstLoggedOn.value"
      :max="lastDay"
      :marked="loggedDays.days.value"
      class="mt-3"
      @paged="loggedDays.month.value = $event"
    />
    <!-- Its own error, under a calendar still in use: without its dots every
         day can still be picked. -->
    <LoadErrorState
      :error="loggedDays.error.value"
      title="Couldn't load logged days"
      nested
      class="mt-3"
      @retry="loggedDays.load"
    />
    <USeparator class="my-3" />
    <LoadErrorState
      :error="error"
      :title="`Couldn't load ${formatDayHeadingFromISO(picked)}`"
      nested
      @retry="load"
    >
      <!-- A newly picked day keeps the last answer up, dimmed; ADR 0007's
           150 ms delay sits in the transition, so a read answered faster than
           that never dims. The cold load shows the skeleton undimmed. -->
      <section
        aria-labelledby="day-lookup-day"
        :aria-busy="pending"
        class="transition-opacity delay-150"
        :class="pending && answered && 'opacity-50'"
      >
        <!-- On a narrow phone the tally drops under the day rather than
             either breaking mid-phrase. -->
        <div
          class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
        >
          <h3
            id="day-lookup-day"
            class="flex items-center gap-2 text-h2 text-highlighted"
          >
            <UIcon
              name="i-lucide-calendar"
              class="size-5 text-muted"
              aria-hidden
            />
            {{ heading }}
          </h3>
          <p v-if="entries.length" class="text-sm text-muted tabular-nums">
            {{ tally }}
          </p>
        </div>
        <!-- The first read only (ADR 0007's cold load); a later pick keeps the
             last answer up instead. Decorative, so hidden: the section's
             aria-busy already says it is loading, and each USkeleton would
             otherwise raise an alert. -->
        <ul
          v-if="!answered"
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
        <p v-if="answered && !entries.length" class="mt-2 text-sm text-muted">
          Nothing logged on {{ plain }}.
        </p>
        <!-- Every Entry, uncapped: the look-up answers the question in full,
             and is read-only on every day (deletion stays on Today). -->
        <EntryList v-else-if="entries.length" :entries="entries" class="mt-2" />
      </section>
    </LoadErrorState>
  </UCard>
</template>
