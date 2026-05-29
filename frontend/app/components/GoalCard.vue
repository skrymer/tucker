<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  goal: components['schemas']['GoalResponse']
}>()

// The rate is stored as a 32-bit float server-side, so values like 0.6 widen
// to 0.6000000238…; round to the 0.05 granularity the rate is chosen at.
const formattedRate = computed(() =>
  Number(props.goal.rateKgPerWeek.toFixed(2)),
)

const formattedStartedOn = computed(() => {
  const [y, m, d] = props.goal.startedOn.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
})
</script>

<template>
  <UCard>
    <dl class="grid grid-cols-2 gap-x-6 gap-y-3">
      <div>
        <dt class="text-sm text-muted">Target weight</dt>
        <dd class="font-medium text-default">
          {{ props.goal.targetWeightKg.toFixed(1) }} kg
        </dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Rate</dt>
        <dd class="font-medium text-default">{{ formattedRate }} kg/week</dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Start weight</dt>
        <dd class="font-medium text-default">
          {{ props.goal.startWeightKg.toFixed(1) }} kg
        </dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Started</dt>
        <dd class="font-medium text-default">{{ formattedStartedOn }}</dd>
      </div>
    </dl>
  </UCard>
</template>
