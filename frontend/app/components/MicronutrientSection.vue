<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type UnmatchedFood = components['schemas']['UnmatchedFoodResponse']

defineProps<{
  /** Null until read, and while a failed read stands. */
  intake: components['schemas']['MicronutrientIntakeResponse'] | null
  /**
   * Whether the figures below are being re-read. Keep-stale-and-dim rather
   * than blank: a match refreshes this card, and what is on screen until the
   * answer lands is the coverage from before it (ADR 0007).
   */
  pending?: boolean
  error?: unknown
}>()
const emit = defineEmits<{ match: [UnmatchedFood]; retry: [] }>()
</script>

<template>
  <ContentCard
    subject="micronutrients"
    title="Vitamins and minerals"
    :state="pending ? 'busy' : undefined"
    :error="error"
    error-title="Couldn't load your vitamins and minerals"
    @retry="emit('retry')"
  >
    <MicronutrientBody
      v-if="intake"
      :intake="intake"
      :pending="pending"
      @match="emit('match', $event)"
    />
  </ContentCard>
</template>
