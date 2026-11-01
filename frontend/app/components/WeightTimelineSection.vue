<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'

// Null until read, and while a failed read stands.
defineProps<{
  timeline: components['schemas']['WeightTimelineResponse'] | null
  pending?: boolean
  error?: unknown
}>()
const emit = defineEmits<{ retry: [] }>()

/**
 * How wide a window is being asked about. Owned by the page, which turns it into
 * the request; the section only offers the choice.
 */
// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const windowDays = defineModel<TimelineWindow>('windowDays', { default: 28 })

const windowItems: TabsItem[] = TIMELINE_WINDOWS.map((days) => ({
  label: `${days} days`,
  value: days,
}))
</script>

<template>
  <ContentCard
    subject="weightTimeline"
    title="Your weight"
    :state="pending ? 'busy' : undefined"
    :error="error"
    error-title="Couldn't load your weight"
    @retry="emit('retry')"
  >
    <template #trailing>
      <SectionTabs v-model="windowDays" :items="windowItems" label="Window" />
    </template>
    <WeightTimelineBody
      v-if="timeline"
      :timeline="timeline"
      :pending="pending"
    />
  </ContentCard>
</template>
