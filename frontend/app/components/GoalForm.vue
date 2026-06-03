<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

type LatestWeight = components['schemas']['WeightMeasurementResponse']

type GoalPayload = {
  startedOn: string
  startWeightKg: number
  targetWeightKg: number
  rateKgPerWeek: number
}

const props = defineProps<{
  latestWeight: LatestWeight
}>()

const emit = defineEmits<{
  submit: [GoalPayload]
}>()

const today = () => localToday()

const schema = z.object({
  targetWeightKg: z
    .number({ error: 'Enter a target weight' })
    .positive('Target weight must be greater than 0')
    .lt(props.latestWeight.weightKg, 'Target must be below your start weight'),
  rateKgPerWeek: z
    .number({ error: 'Enter a weekly rate' })
    .min(0.05, 'Rate must be at least 0.05 kg/week')
    .max(1.5, 'Rate must be at most 1.5 kg/week'),
})

const state = reactive({
  targetWeightKg: undefined as number | undefined,
  rateKgPerWeek: undefined as number | undefined,
})

function onSubmit() {
  emit('submit', {
    startedOn: today(),
    startWeightKg: props.latestWeight.weightKg,
    targetWeightKg: state.targetWeightKg!,
    rateKgPerWeek: state.rateKgPerWeek!,
  })
}

const formattedDate = computed(() =>
  formatDateFromISO(props.latestWeight.measuredOn),
)
</script>

<template>
  <UForm
    :state="state"
    :schema="schema"
    class="flex flex-col gap-4"
    @submit="onSubmit"
  >
    <UFormField label="Starting weight">
      <p class="text-default">
        {{ props.latestWeight.weightKg.toFixed(1) }} kg · as of
        {{ formattedDate }}
      </p>
    </UFormField>

    <UFormField label="Target weight (kg)" name="targetWeightKg" required>
      <UInputNumber
        v-model="state.targetWeightKg"
        :step="0.1"
        :step-snapping="false"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Rate (kg/week)" name="rateKgPerWeek" required>
      <UInputNumber
        v-model="state.rateKgPerWeek"
        :min="0"
        :step="0.05"
        :step-snapping="false"
        class="w-full"
      />
    </UFormField>

    <UButton type="submit" color="primary" class="w-full">Set goal</UButton>
  </UForm>
</template>
