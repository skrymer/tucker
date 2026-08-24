<script setup lang="ts">
import { type CalendarDate, parseDate } from '@internationalized/date'
import type { PopoverProps } from '@nuxt/ui'
import { useFormField } from '@nuxt/ui/composables'

/**
 * A date field that opens a calendar rather than asking for a typed date.
 *
 * The heading drills day → month → year, so a day decades away is a few taps
 * rather than one step per month — which is what a native `type="date"` costs
 * on Android, where it renders as a tap-only calendar with no typed path
 * (issue #241). `max` states the field's latest allowed day to the control
 * itself, so an out-of-range day is refused at the point of picking instead of
 * on submit.
 */
const props = defineProps<{
  modelValue?: string
  /** Latest selectable day, ISO `yyyy-mm-dd`. */
  max?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string] }>()

// Adopt the wrapping <UFormField>'s wiring the way UInput and USelectMenu do:
// `id` so its <label> addresses the trigger, and `color` so a failed validation
// rings this control red like every other field in the form — `color: 'error'`
// hits UButton's outline+error compound variant. (UButton has no `highlight`
// prop, unlike UInput, so there is nothing to forward for that half.)
const { id, ariaAttrs, color, disabled, emitFormChange } = useFormField()

const open = ref(false)

/**
 * Carries the picked date to assistive tech as a *description*.
 *
 * `<UFormField>`'s `<label for>` beats the button's own text in the
 * accessible-name computation, so a screen reader would hear the field but
 * never the date it holds — which the `<input type="date">` this replaces did
 * announce. Appends to whatever the field already points at (its help or error
 * text) rather than replacing it.
 */
function useAccessibleValue() {
  // `id` is only defined inside a <UFormField>; the fallback keeps a bare
  // DateField's description addressable too.
  const fallbackId = useId()
  const valueId = computed(() => `${id.value ?? fallbackId}-value`)
  const describedBy = computed(() => {
    const ids = [
      ariaAttrs.value?.['aria-describedby'],
      props.modelValue ? valueId.value : undefined,
    ].filter(Boolean)
    // undefined, not '': an empty string would leave the attribute on the
    // element pointing at nothing.
    return ids.length ? ids.join(' ') : undefined
  })
  return { valueId, describedBy }
}

const { valueId, describedBy } = useAccessibleValue()

// A calendar's value is optional in a way an ISO string isn't — an unset field
// is `''`. A malformed one costs the field, not the page: `parseDate` throws,
// this renders inside an SPA with no error boundary, and an empty picker beats
// a white screen. It is still loud, because nothing should reach here.
function asCalendarDate(iso?: string): CalendarDate | undefined {
  if (!iso) return undefined
  try {
    return parseDate(iso)
  } catch {
    console.warn(`[DateField] ignoring a value that is not an ISO date: ${iso}`)
    return undefined
  }
}

const selected = computed({
  get: () => asCalendarDate(props.modelValue),
  // The optional arm is the model type's, not a real case: a single-date
  // calendar has no gesture that clears its own value, and re-tapping the
  // selected day is inert.
  set: (value?: CalendarDate) => {
    if (!value) return
    emit('update:modelValue', value.toString())
    // <UForm> validates off bus events and never watches state, so without
    // this a "pick a date" error outlives the pick that resolved it.
    emitFormChange()
    open.value = false
  },
})

const label = computed(() =>
  selected.value ? formatDateFromISO(props.modelValue!) : 'Choose a date',
)

// Reka names the popover after its trigger's id, which useFormField's `id`
// replaces — leaving that reference dangling. Name the dialog outright instead.
// `content` is typed to Reka's positioning props and doesn't model the
// pass-through attributes v-bind forwards to the element regardless.
const contentProps = {
  'aria-label': 'Choose a date',
} as PopoverProps['content']
</script>

<template>
  <UPopover v-model:open="open" :content="contentProps">
    <UButton
      :id="id"
      :color="color ?? 'neutral'"
      variant="outline"
      trailing-icon="i-lucide-calendar"
      :disabled="disabled"
      :class="[
        // Nuxt UI's own input treatment, since this reads as a form control
        // rather than a button: `rounded-md` + the `md` size padding from the
        // input theme, overriding the app-wide pill (DESIGN.md → Component
        // treatments).
        'w-full justify-between rounded-md px-2.5 py-1.5 text-base/5 font-normal',
        modelValue ? 'text-highlighted' : 'text-dimmed',
      ]"
      :ui="{ trailingIcon: 'text-dimmed' }"
      v-bind="ariaAttrs"
      :aria-describedby="describedBy"
    >
      {{ label }}
    </UButton>

    <template #content>
      <UCalendar v-model="selected" :max-value="asCalendarDate(max)" />
    </template>
  </UPopover>

  <!-- Outside the trigger: inside it, this text would join the button's own
       content and be announced twice for a DateField with no wrapping label. -->
  <span v-if="modelValue" :id="valueId" class="sr-only">{{ label }}</span>
</template>
