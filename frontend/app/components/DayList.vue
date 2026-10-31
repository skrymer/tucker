<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'
import type { RelativeDay } from '~/utils/day'

type EntryResponse = components['schemas']['EntryResponse']

const props = defineProps<{
  day: RelativeDay
  date: string
  entries: EntryResponse[]
  caloriesConsumed: number
  /** The day's read failed: the card keeps its band over a Retry. */
  error?: unknown
}>()

const emit = defineEmits<{
  delete: [EntryResponse]
  retry: []
}>()

const heading = computed(() => relativeDayHeading(props.day, props.date))

const tally = computed(() =>
  formatDayTally(props.entries.length, props.caloriesConsumed),
)
</script>

<template>
  <ContentCard
    :subject="day"
    :title="heading"
    :error="error"
    :error-title="`Couldn't load ${day}'s entries`"
    @retry="emit('retry')"
  >
    <template v-if="!error" #trailing>
      <p class="text-sm text-muted tabular-nums">{{ tally }}</p>
    </template>
    <CappedEntryList :entries="entries">
      <template #action="{ entry }">
        <RowActionButton
          action="delete"
          :aria-label="`Delete ${formatEntryName(entry)}`"
          @click="emit('delete', entry)"
        />
      </template>
    </CappedEntryList>
  </ContentCard>
</template>
