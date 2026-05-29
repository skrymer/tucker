<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  today: string
  latest: components['schemas']['WeightMeasurementResponse'] | null
}>()

const emit = defineEmits<{
  logged: [{ date: string; weightKg: number }]
}>()

const open = ref(false)

const loggedToday = computed(
  () => props.latest != null && props.latest.measuredOn === props.today,
)

function handleSubmit(payload: { date: string; weightKg: number }) {
  open.value = false
  emit('logged', payload)
}
</script>

<template>
  <UCard>
    <h2 class="text-sm font-medium text-muted">Today's weight</h2>

    <template v-if="loggedToday">
      <div class="mt-1 flex items-center justify-between gap-3">
        <p class="text-2xl font-bold text-default">
          {{ latest!.weightKg.toFixed(1) }} kg
        </p>
        <UButton
          variant="ghost"
          icon="i-lucide-pencil"
          aria-label="Edit today's weight"
          @click="open = true"
        />
      </div>
    </template>

    <template v-else>
      <p class="mt-1 text-sm text-muted">No weight logged today.</p>
      <UButton
        color="primary"
        icon="i-lucide-plus"
        block
        class="mt-3"
        @click="open = true"
      >
        Log weight
      </UButton>
    </template>

    <LogWeightSheet
      v-model:open="open"
      :date="today"
      :initial-weight-kg="latest?.weightKg"
      @submit="handleSubmit"
    />
  </UCard>
</template>
