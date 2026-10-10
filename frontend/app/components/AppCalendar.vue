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

const selected = computed({
  get: () => isoToCalendarDate(model.value),
  // Never empty: `prevent-deselect` keeps a re-picked day picked.
  set: (value?: CalendarDate) => {
    model.value = value!.toString()
  },
})
const minValue = computed(() => isoToCalendarDate(props.min))
const maxValue = computed(() => isoToCalendarDate(props.max))

/**
 * The day the calendar is showing, owned here so its month can be reported.
 * It also follows the focused day, so most of its moves stay within a month.
 */
function useShownMonth() {
  const placeholder = shallowRef<DateValue>(
    selected.value ?? today(getLocalTimeZone()),
  )
  watch(
    () => placeholder.value.toString().slice(0, 7),
    (month) => emit('paged', month),
  )
  return placeholder
}

/**
 * UCalendar forwards nothing to a day's button but its own props, so a mark
 * reaches assistive tech as a description the day's content sets on it.
 */
function useMarkedDays() {
  const markId = useId()
  const markedDays = computed(() => new Set(props.marked))
  const isMarked = (day: DateValue) => markedDays.value.has(day.toString())

  // The ref fires before the content is placed inside its button.
  async function describe(content: unknown, day: DateValue) {
    if (!(content instanceof Element)) return
    await nextTick()
    const button = content.closest('[data-reka-calendar-cell-trigger]')
    if (isMarked(day)) button?.setAttribute('aria-describedby', markId)
    else button?.removeAttribute('aria-describedby')
  }

  return { markId, isMarked, describe }
}

const placeholder = useShownMonth()
const { markId, isMarked, describe } = useMarkedDays()
</script>

<template>
  <div>
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
        <UChip :show="isMarked(day)" size="2xs">
          <span :ref="(content) => describe(content, day)">{{ day.day }}</span>
        </UChip>
      </template>
    </UCalendar>
    <span :id="markId" class="sr-only">Has Entries</span>
  </div>
</template>
