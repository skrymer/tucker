<script setup lang="ts">
import {
  type CalendarDate,
  type DateValue,
  getLocalTimeZone,
  today,
} from '@internationalized/date'

// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
/** The selected day, ISO `yyyy-mm-dd`; `''` while none is. */
const model = defineModel<string>({ required: true })

const props = defineProps<{
  /** Earliest selectable day, ISO `yyyy-mm-dd`. */
  min?: string
  /** Latest selectable day, ISO `yyyy-mm-dd`. */
  max?: string
  /** Days that hold Entries, ISO `yyyy-mm-dd`. */
  marked?: string[]
}>()

const emit = defineEmits<{
  /** The month now shown, ISO `yyyy-mm`. */
  paged: [month: string]
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
 * The day the calendar is showing, owned here so its month can be reported.
 * It also follows the focused day, so most of its moves stay within a month.
 */
function useShownMonth(opensOn?: DateValue) {
  const placeholder = shallowRef<DateValue>(
    opensOn ?? today(getLocalTimeZone()),
  )
  watch(
    () => placeholder.value.toString().slice(0, 7),
    (month) => emit('paged', month),
  )
  return placeholder
}

function useMarkedDays() {
  const markedDays = computed(() => new Set(props.marked))
  return (day: DateValue) => markedDays.value.has(day.toString())
}

const { selected, minValue, maxValue } = useCalendarValues()
const placeholder = useShownMonth(selected.value)
const isMarked = useMarkedDays()
</script>

<template>
  <UCalendar
    v-model="selected"
    v-model:placeholder="placeholder"
    :min-value="minValue"
    :max-value="maxValue"
    :week-starts-on="1"
    :year-controls="false"
    prevent-deselect
  >
    <template #day="{ day }">
      <UChip :show="isMarked(day)" size="2xs">{{ day.day }}</UChip>
    </template>
  </UCalendar>
</template>
