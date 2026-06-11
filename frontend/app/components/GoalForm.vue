<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

type CurrentTrend = components['schemas']['WeightTrendResponse']

type GoalPayload = {
  startedOn: string
  targetWeightKg: number
  rateKgPerWeek: number
}

const props = defineProps<{
  currentTrend: CurrentTrend
  // The client validates against the trend it was handed, but the backend
  // re-derives the live trend at creation and is authoritative (ADR 0016); a 400
  // is fed back here as a field error.
  targetError?: string
}>()

const emit = defineEmits<{
  submit: [GoalPayload]
}>()

const today = () => localToday()

const schema = z.object({
  targetWeightKg: z
    .number({ error: 'Enter a target weight' })
    .positive('Target weight must be greater than 0')
    .lt(props.currentTrend.trendKg, 'Target must be below your start weight'),
  rateKgPerWeek: z
    .number({ error: 'Enter a weekly rate' })
    .min(0.05, 'Rate must be at least 0.05 kg/week')
    .max(1.5, 'Rate must be at most 1.5 kg/week'),
})

const state = reactive({
  targetWeightKg: undefined as number | undefined,
  rateKgPerWeek: undefined as number | undefined,
})

// The start weight isn't sent: the backend anchors it on the live Trend Weight at
// creation (ADR 0016), so a fresh Goal reads 0% (start == now).
function onSubmit() {
  emit('submit', {
    startedOn: today(),
    targetWeightKg: state.targetWeightKg!,
    rateKgPerWeek: state.rateKgPerWeek!,
  })
}
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
        {{ props.currentTrend.trendKg.toFixed(1) }} kg · your trend, smoothed
        from recent readings
      </p>
    </UFormField>

    <UFormField
      label="Target weight (kg)"
      name="targetWeightKg"
      :error="props.targetError"
      required
    >
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
