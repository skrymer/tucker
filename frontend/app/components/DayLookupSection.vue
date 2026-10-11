<script setup lang="ts">
import type { RelativeDay } from '~/utils/day'

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
  return { picked, entries, tally, error, pending, load }
}

/** The day as Today names it: "Today · …" / "Tomorrow · …", plain otherwise. */
function useDayHeading(picked: Ref<string>) {
  const relativeDay = computed<RelativeDay | null>(() => {
    const today = localToday()
    if (picked.value === today) return 'today'
    return picked.value === localTomorrow(today) ? 'tomorrow' : null
  })
  const plain = computed(() => formatDayHeadingFromISO(picked.value))
  const heading = computed(() =>
    relativeDay.value
      ? relativeDayHeading(relativeDay.value, picked.value)
      : plain.value,
  )
  return { heading, plain }
}

const { picked, entries, tally, error, pending, load } = usePickedDay()
await load()
const { heading, plain } = useDayHeading(picked)

/** The furthest day an Entry can be logged on (ADR 0035). */
const lastDay = localTomorrow()
</script>

<template>
  <UCard role="region" aria-labelledby="day-lookup-heading">
    <h2 id="day-lookup-heading" class="text-h2 text-highlighted">
      Look up a day
    </h2>
    <AppCalendar v-model="picked" :max="lastDay" class="mt-3" />
    <USeparator class="my-3" />
    <LoadErrorState
      :error="error"
      :title="`Couldn't load ${plain}`"
      @retry="load"
    >
      <!-- The heading moves at once while the Entries below are still the
           last day's; ADR 0007's 150 ms delay sits in the transition, so a
           read answered faster than that never dims. -->
      <section
        aria-labelledby="day-lookup-day"
        :aria-busy="pending"
        class="transition-opacity delay-150"
        :class="pending && 'opacity-50'"
      >
        <!-- On a narrow phone the tally drops under the day rather than
             either breaking mid-phrase. -->
        <div
          class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
        >
          <h3
            id="day-lookup-day"
            class="flex items-center gap-2 font-semibold text-highlighted"
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
        <p v-if="!entries.length" class="mt-2 text-sm text-muted">
          Nothing logged on {{ plain }}.
        </p>
        <!-- Every Entry, uncapped: the look-up answers the question in full,
             and is read-only on every day (deletion stays on Today). -->
        <ul v-else class="mt-2 divide-y divide-default">
          <li v-for="entry in entries" :key="entry.id" class="py-2">
            <FigureRow :name="entry.name" :figures="formatEntryFigures(entry)">
              <template #marker>
                <EstimateBadge v-if="entry.isEstimate" />
              </template>
            </FigureRow>
          </li>
        </ul>
      </section>
    </LoadErrorState>
  </UCard>
</template>
