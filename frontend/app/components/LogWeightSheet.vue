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

const isDesktop = useIsDesktop()

// In date-editable mode the picker defaults to, and can't exceed, today.
const today = computed(
  () => props.today ?? new Date().toLocaleDateString('en-CA'),
)

const schema = z.object({
  weightKg: z
    .number({ error: 'Enter your weight in kg' })
    .positive('Weight must be greater than 0'),
  measuredOn: z.string().min(1, 'Pick a date'),
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
  <UDrawer
    v-if="!isDesktop"
    :open="open"
    direction="bottom"
    title="Log weight"
    @update:open="(value) => emit('update:open', value)"
  >
    <template #body>
      <UForm
        :state="state"
        :schema="schema"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField v-if="!date" label="Date" name="measuredOn" required>
          <UInput
            v-model="state.measuredOn"
            type="date"
            :max="today"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Weight (kg)" name="weightKg" required>
          <UInputNumber v-model="state.weightKg" :step="0.1" class="w-full" />
        </UFormField>

        <UButton type="submit" color="primary" class="w-full">
          Save weight
        </UButton>
      </UForm>
    </template>
  </UDrawer>

  <UModal
    v-else
    :open="open"
    title="Log weight"
    @update:open="(value) => emit('update:open', value)"
  >
    <template #body>
      <UForm
        :state="state"
        :schema="schema"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField v-if="!date" label="Date" name="measuredOn" required>
          <UInput
            v-model="state.measuredOn"
            type="date"
            :max="today"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Weight (kg)" name="weightKg" required>
          <UInputNumber v-model="state.weightKg" :step="0.1" class="w-full" />
        </UFormField>

        <UButton type="submit" color="primary" class="w-full">
          Save weight
        </UButton>
      </UForm>
    </template>
  </UModal>
</template>
