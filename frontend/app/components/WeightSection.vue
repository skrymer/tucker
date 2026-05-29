<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  today: string
  measurements: components['schemas']['WeightMeasurementResponse'][]
  disabled?: boolean
}>()

const emit = defineEmits<{
  logged: [{ date: string; weightKg: number }]
}>()

const open = ref(false)

function handleSubmit(payload: { date: string; weightKg: number }) {
  open.value = false
  emit('logged', payload)
}
</script>

<template>
  <section
    class="flex flex-col gap-3"
    aria-labelledby="weight-log-heading"
    :aria-disabled="props.disabled || undefined"
    :class="{ 'pointer-events-none opacity-50 select-none': props.disabled }"
  >
    <header class="flex items-center justify-between">
      <h2 id="weight-log-heading" class="text-lg font-semibold text-default">
        Weight log
      </h2>
      <UButton
        v-if="!props.disabled"
        icon="i-lucide-plus"
        color="primary"
        @click="open = true"
      >
        Add weight
      </UButton>
    </header>

    <!-- Gated: a Profile must exist before weight can be logged. -->
    <p v-if="props.disabled" class="text-sm text-muted">
      Set your profile first to log your weight.
    </p>

    <template v-else>
      <WeightList v-if="measurements.length > 0" :measurements="measurements" />
      <p v-else class="text-sm text-muted">No weight logged yet.</p>

      <!-- No `date` prop → the sheet renders its date picker for backfill. -->
      <LogWeightSheet
        v-model:open="open"
        :today="props.today"
        @submit="handleSubmit"
      />
    </template>
  </section>
</template>
