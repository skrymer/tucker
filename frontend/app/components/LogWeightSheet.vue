<script setup lang="ts">
import { z } from 'zod'

const props = defineProps<{
  open: boolean
  date?: string
  today?: string
  initialWeightKg?: number
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  submit: [{ date: string; weightKg: number }]
}>()

// In date-editable mode the picker defaults to, and can't exceed, today.
const today = computed(() => props.today ?? localToday())

const schema = z.object({
  weightKg: z
    .number({ error: 'Enter your weight in kg' })
    .positive('Weight must be greater than 0'),
  // Deliberately unconstrained, unlike ProfileForm's birth date: this field has
  // no API-supplied path into it. It is seeded from `date`/`today` and can only
  // be changed by the picker, which is bounded to `today` and cannot clear
  // itself — so a required-ness or range rule here is a message nothing can
  // ever show.
  measuredOn: z.string(),
})

const state = reactive({
  weightKg: props.initialWeightKg,
  measuredOn: props.date ?? today.value,
})

// Re-seed each time the sheet (re)opens so an "edit" reflects the latest
// server value rather than whatever was typed in a previous session.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      state.weightKg = props.initialWeightKg
      state.measuredOn = props.date ?? today.value
    }
  },
)

function onSubmit() {
  emit('submit', { date: state.measuredOn, weightKg: state.weightKg! })
}
</script>

<template>
  <ResponsiveOverlay
    :open="open"
    title="Log weight"
    @update:open="(value) => emit('update:open', value)"
  >
    <UForm
      :state="state"
      :schema="schema"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UFormField v-if="!date" label="Date" name="measuredOn" required>
        <!-- Lazy: WeightTile on `/` always locks the date, so the landing
           route must not carry the calendar it can never render. -->
        <LazyDateField v-model="state.measuredOn" :max="today" />
      </UFormField>

      <UFormField label="Weight (kg)" name="weightKg" required>
        <NumberField v-model="state.weightKg" :step="0.1" class="w-full" />
      </UFormField>

      <UButton type="submit" color="primary" class="w-full">
        Save weight
      </UButton>
    </UForm>
  </ResponsiveOverlay>
</template>
