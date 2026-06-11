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

// The current weight at a glance: the latest reading and its neutral delta
// against the one before it. The full chronological log is reference material,
// not a control, so it lives on its own /profile/weight page reached via "View
// history" rather than sharing space with the actionable Profile sections (#105).
function useLatestReading() {
  const ordered = computed(() => sortByMeasuredOnDesc(props.measurements))
  const latest = computed(() => ordered.value[0] ?? null)
  const previous = computed(() => ordered.value[1] ?? null)
  return { latest, previous }
}

const { latest, previous } = useLatestReading()
</script>

<template>
  <section
    class="flex flex-col gap-3"
    aria-labelledby="weight-heading"
    :aria-disabled="props.disabled || undefined"
    :class="{ 'pointer-events-none opacity-50 select-none': props.disabled }"
  >
    <header class="flex items-center justify-between">
      <h2 id="weight-heading" class="text-lg font-semibold text-default">
        Weight
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
      <template v-if="measurements.length > 0">
        <WeightSummary :latest="latest" :previous="previous" />

        <UButton
          to="/profile/weight"
          variant="subtle"
          color="neutral"
          block
          trailing-icon="i-lucide-chevron-right"
        >
          View history
        </UButton>
      </template>
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
