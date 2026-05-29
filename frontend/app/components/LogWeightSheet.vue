<script setup lang="ts">
import { z } from 'zod'

const props = defineProps<{
  open: boolean
  date?: string
  initialWeightKg?: number
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  submit: [{ date: string; weightKg: number }]
}>()

const isDesktop = useIsDesktop()

const schema = z.object({
  weightKg: z
    .number({ error: 'Enter your weight in kg' })
    .positive('Weight must be greater than 0'),
})

const state = reactive({
  weightKg: props.initialWeightKg,
})

// Re-seed each time the sheet (re)opens so an "edit" reflects the latest
// server value rather than whatever was typed in a previous session.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) state.weightKg = props.initialWeightKg
  },
)

function onSubmit() {
  if (!props.date) return
  emit('submit', { date: props.date, weightKg: state.weightKg! })
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
