<script setup lang="ts">
import type { PopoverProps } from '@nuxt/ui'
import { useFormField } from '@nuxt/ui/composables'

/**
 * A form field that opens `AppCalendar` in a popover rather than asking for a
 * typed date — a native `type="date"` on Android is a tap-only calendar that
 * steps one month at a time.
 */
const props = defineProps<{
  modelValue?: string
  /** Earliest selectable day, ISO `yyyy-mm-dd`. */
  min?: string
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

// The held day, if it is one: an unset field is `''`, and a malformed value
// shows the prompt rather than costing the page.
const selected = computed(() => isoToCalendarDate(props.modelValue)?.toString())

function pick(day: string) {
  emit('update:modelValue', day)
  // <UForm> validates off bus events and never watches state, so without
  // this a "pick a date" error outlives the pick that resolved it.
  emitFormChange()
  open.value = false
}

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
      <AppCalendar
        :model-value="selected ?? ''"
        :min="min"
        :max="max"
        @update:model-value="pick"
      />
    </template>
  </UPopover>

  <!-- Outside the trigger: inside it, this text would join the button's own
       content and be announced twice for a DateField with no wrapping label. -->
  <span v-if="modelValue" :id="valueId" class="sr-only">{{ label }}</span>
</template>
