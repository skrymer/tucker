<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'
import type { RelativeDay } from '~/utils/day'

type EntryResponse = components['schemas']['EntryResponse']

const props = defineProps<{
  day: RelativeDay
  date: string
  entries: EntryResponse[]
  caloriesConsumed: number
}>()

const emit = defineEmits<{
  delete: [EntryResponse]
}>()

// Static per day: both lists can share a page, and each names its own region.
const headingId = `day-list-${props.day}`
const heading = computed(() => relativeDayHeading(props.day, props.date))

const tally = computed(() =>
  formatDayTally(props.entries.length, props.caloriesConsumed),
)
</script>

<template>
  <UCard as="section" :aria-labelledby="headingId">
    <!-- On a narrow phone the tally drops under the day rather than either
         breaking mid-phrase. -->
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2
        :id="headingId"
        class="flex items-center gap-2 text-h2 text-highlighted"
      >
        <UIcon
          :name="RELATIVE_DAYS[day].icon"
          class="size-5 text-muted"
          aria-hidden
        />
        {{ heading }}
      </h2>
      <p class="text-sm text-muted tabular-nums">
        {{ tally }}
      </p>
    </div>
    <CappedEntryList :entries="entries" class="mt-2">
      <template #action="{ entry }">
        <RowActionButton
          action="delete"
          :aria-label="`Delete ${formatEntryName(entry)}`"
          @click="emit('delete', entry)"
        />
      </template>
    </CappedEntryList>
  </UCard>
</template>
