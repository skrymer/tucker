<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

type CurrentTrend = components['schemas']['WeightTrendResponse']

const props = defineProps<{
  currentTrend: CurrentTrend
  // The backend's refusal of a submit, by what it is about. The client validates
  // against the trend it was handed, but the backend re-derives the anchor at
  // creation and is authoritative (ADR 0016) — a refused target lands on its
  // field; so does a rate the user's Maintenance cannot supply (ADR 0030), a rule
  // only the backend can apply. One naming no field is about neither input — a
  // skewed client clock, or no weight logged yet — and is shown above the submit.
  refusal?: GoalRefusal
  /** The create mutation's in-flight flag — shows on the submit (ADR 0007). */
  pending?: boolean
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

// A server refusal quotes the value that was sent, and Nuxt UI resolves a field's
// message as `error || schemaError` — so a standing one outranks the schema and
// would go on naming a figure the user has since changed. Each is held locally
// and dropped the moment its own input moves; editing the other says nothing
// about it. `refusal.form` is about neither input, so nothing local clears it.
function useServerRefusals() {
  const refusals = reactive({
    targetWeightKg: undefined as string | undefined,
    rateKgPerWeek: undefined as string | undefined,
  })

  watch(
    () => [props.refusal?.target, props.refusal?.rate] as const,
    ([target, rate]) => {
      refusals.targetWeightKg = target
      refusals.rateKgPerWeek = rate
    },
    { immediate: true },
  )
  watch(
    () => state.targetWeightKg,
    () => {
      refusals.targetWeightKg = undefined
    },
  )
  watch(
    () => state.rateKgPerWeek,
    () => {
      refusals.rateKgPerWeek = undefined
    },
  )

  return refusals
}

const refusals = useServerRefusals()

// The start weight isn't sent: the backend anchors it on the live Trend Weight
// (ADR 0016), which is the figure previewed above — so a fresh Goal reads 0%
// (start == now). `startedOn` says when the plan runs from, and never selects
// the anchor.
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
      :error="refusals.targetWeightKg"
      required
    >
      <NumberField v-model="state.targetWeightKg" :step="0.1" class="w-full" />
    </UFormField>

    <UFormField
      label="Rate (kg/week)"
      name="rateKgPerWeek"
      :error="refusals.rateKgPerWeek"
      required
    >
      <NumberField
        v-model="state.rateKgPerWeek"
        :min="0"
        :step="0.05"
        class="w-full"
      />
    </UFormField>

    <p v-if="props.refusal?.form" role="alert" class="text-sm text-error">
      {{ props.refusal.form }}
    </p>

    <UButton type="submit" color="primary" class="w-full" :loading="pending">
      Set goal
    </UButton>
  </UForm>
</template>
