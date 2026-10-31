<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  today: string
  latest: components['schemas']['WeightMeasurementResponse'] | null
  pending?: boolean
  /** The latest-weight read failed: the card keeps its band over a Retry. */
  error?: unknown
}>()

const emit = defineEmits<{
  logged: [{ date: string; weightKg: number }]
  retry: []
}>()

// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const open = defineModel<boolean>('open', { default: false })

const loggedToday = computed(
  () => props.latest != null && props.latest.measuredOn === props.today,
)
</script>

<template>
  <ContentCard
    subject="weight"
    title="Today's weight"
    :error="error"
    error-title="Couldn't load your weight"
    :empty="!loggedToday"
    @retry="emit('retry')"
  >
    <div class="flex items-center justify-between gap-3">
      <p class="text-stat text-default">{{ latest?.weightKg.toFixed(1) }} kg</p>
      <RowActionButton
        action="edit"
        aria-label="Edit today's weight"
        @click="
          () => {
            open = true
          }
        "
      />
    </div>

    <template #empty>
      <p class="text-sm text-muted">No weight logged today.</p>
      <UButton
        color="primary"
        icon="i-lucide-plus"
        block
        class="mt-3"
        @click="
          () => {
            open = true
          }
        "
      >
        Log weight
      </UButton>
    </template>
  </ContentCard>

  <LogWeightSheet
    v-model:open="open"
    :date="today"
    :initial-weight-kg="latest?.weightKg"
    :pending="pending"
    @submit="emit('logged', $event)"
  />
</template>
