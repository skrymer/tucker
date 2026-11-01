<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

// jscpd:ignore-start — every windowed card's shell declares the same read state
// Null until read, and while a failed read stands.
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{
  breakdown: components['schemas']['IntakeBreakdownResponse'] | null
  pending?: boolean
  error?: unknown
}>()
const emit = defineEmits<{ retry: [] }>()

/**
 * Which window is being asked about. Owned by the page, which turns it into the
 * request; the card only offers the choice.
 */
// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const period = defineModel<BreakdownPeriod>('period', { default: 'today' })
// jscpd:ignore-end
</script>

<template>
  <ContentCard
    subject="intakeBreakdown"
    title="What you're eating"
    :state="pending ? 'busy' : undefined"
    :error="error"
    error-title="Couldn't load what you're eating"
    @retry="emit('retry')"
  >
    <template v-if="breakdown" #trailing>
      <!-- The denominator, stated: every share below is of this, never of the
           Calorie Budget (ADR 0026). -->
      <span class="text-label tabular-nums text-default">
        {{ Math.round(breakdown.totalCalories) }} kcal
      </span>
    </template>
    <IntakeBreakdownBody
      v-if="breakdown"
      v-model:period="period"
      :breakdown="breakdown"
      :pending="pending"
    />
  </ContentCard>
</template>
