<script setup lang="ts">
import {
  type CalendarDate,
  type DateValue,
  getLocalTimeZone,
  today,
} from '@internationalized/date'
import type { CalendarGrid, WeekStart } from '~/utils/calendarGrid'

/** Monday: drawn by the calendar and counted by the grid it reports. */
const WEEK_STARTS_ON: WeekStart = 1

// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
/** The selected day, ISO `yyyy-mm-dd`; `''` while none is. */
const model = defineModel<string>({ required: true })

const props = defineProps<{
  /** Earliest selectable day, ISO `yyyy-mm-dd`. */
  min?: string
  /** Latest selectable day, ISO `yyyy-mm-dd`. */
  max?: string
  /** Days that hold Entries, ISO `yyyy-mm-dd`. */
  logged?: string[]
  /** Days that hold a Weight Measurement, ISO `yyyy-mm-dd`. */
  weighed?: string[]
}>()

const emit = defineEmits<{
  /** The days drawn, ISO, both ends inclusive: on opening and on every page. */
  shown: [grid: CalendarGrid]
}>()

/** The ISO strings at the interface, as the calendar's own dates. */
function useCalendarValues() {
  const selected = computed({
    get: () => isoToCalendarDate(model.value),
    // Never empty: `prevent-deselect` keeps a re-picked day picked.
    set: (value?: CalendarDate) => {
      model.value = value!.toString()
    },
  })
  const minValue = computed(() => isoToCalendarDate(props.min))
  const maxValue = computed(() => isoToCalendarDate(props.max))
  return { selected, minValue, maxValue }
}

/**
 * The day the calendar is showing, owned here so the grid it draws can be reported.
 * It also follows the focused day, so most of its moves stay within a month.
 */
function useShownMonth(opensOn?: DateValue) {
  const placeholder = shallowRef<DateValue>(
    opensOn ?? today(getLocalTimeZone()),
  )
  watch(
    () => placeholder.value.toString().slice(0, 7),
    (month) => emit('shown', visibleGrid(month, WEEK_STARTS_ON)),
    { immediate: true },
  )
  return placeholder
}

function useMarkedDays(days: () => string[] | undefined) {
  const markedDays = computed(() => new Set(days()))
  return (day: DateValue) => markedDays.value.has(day.toString())
}

const { selected, minValue, maxValue } = useCalendarValues()
const placeholder = useShownMonth(selected.value)
const isLogged = useMarkedDays(() => props.logged)
const isWeighed = useMarkedDays(() => props.weighed)

/**
 * Each mark's look, shared by the day cells and the legend's swatches. On the
 * selected day a mark takes the day's own text colour, as a primary mark
 * vanishes into the primary circle, and on a day that can't be picked or lies in
 * a neighbouring month it dims with the numeral.
 */
const MARK_SHAPE = 'size-1.5 rounded-full'
const MARK = {
  weighIn: `${MARK_SHAPE} ring-1 ring-inset ring-primary in-data-selected:ring-(--ui-text-inverted) in-data-disabled:ring-(--ui-text-muted) in-data-outside-view:ring-(--ui-text-muted)`,
  entries: `${MARK_SHAPE} bg-primary in-data-selected:bg-(--ui-text-inverted) in-data-disabled:bg-(--ui-text-muted) in-data-outside-view:bg-(--ui-text-muted)`,
}
</script>

<template>
  <div>
    <!-- Always six weeks: the grid visibleGrid reports. -->
    <UCalendar
      v-model="selected"
      v-model:placeholder="placeholder"
      :min-value="minValue"
      :max-value="maxValue"
      :week-starts-on="WEEK_STARTS_ON"
      fixed-weeks
      :year-controls="false"
      prevent-deselect
    >
      <template #day="{ day }">
        <span class="relative flex size-full items-center justify-center">
          {{ day.day }}
          <span
            class="absolute inset-x-0 bottom-0.5 flex justify-center gap-0.5"
          >
            <span
              v-if="isWeighed(day)"
              data-mark="weigh-in"
              :class="MARK.weighIn"
            />
            <span
              v-if="isLogged(day)"
              data-mark="entries"
              :class="MARK.entries"
            />
          </span>
        </span>
      </template>
    </UCalendar>
    <!-- What the marks mean. A screen reader learns the same from the picked
         day's panel, as nothing in a day cell can join its name. -->
    <p
      v-if="logged || weighed"
      aria-hidden="true"
      data-testid="calendar-legend"
      class="mt-2 flex justify-center gap-4 text-sm text-muted"
    >
      <span v-if="logged" class="flex items-center gap-1.5">
        <span :class="MARK.entries" />Entries
      </span>
      <span v-if="weighed" class="flex items-center gap-1.5">
        <span :class="MARK.weighIn" />Weigh-in
      </span>
    </p>
  </div>
</template>
