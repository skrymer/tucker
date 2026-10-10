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
// Cap the list so a long day never buries what sits below it. Entries arrive
// oldest-first (ORDER BY id), so the most recent few — a just-logged one
// included — are the visible tail.
function useCappedEntries() {
  const VISIBLE = 3
  const { expanded, label, toggle } = useExpander(() => props.entries.length)
  const canExpand = computed(() => props.entries.length > VISIBLE)
  const visibleEntries = computed(() =>
    expanded.value ? props.entries : props.entries.slice(-VISIBLE),
  )
  return { visibleEntries, canExpand, expanderLabel: label, toggle }
}

const { visibleEntries, canExpand, expanderLabel, toggle } = useCappedEntries()

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
    <ul class="mt-2 divide-y divide-default">
      <li
        v-for="entry in visibleEntries"
        :key="entry.id"
        class="flex items-center justify-between gap-2 py-2"
      >
        <FigureRow
          class="flex-1"
          :name="entry.name"
          :figures="formatIntakeFigures(entry.calories, entry.protein)"
        >
          <template #marker>
            <EstimateBadge v-if="entry.isEstimate" />
          </template>
        </FigureRow>
        <UButton
          :aria-label="`Delete ${formatEntryName(entry)}`"
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          square
          class="size-9 shrink-0 text-muted hover:text-default"
          :ui="{ base: 'justify-center' }"
          @click="emit('delete', entry)"
        />
      </li>
    </ul>

    <UButton
      v-if="canExpand"
      variant="ghost"
      color="neutral"
      size="sm"
      block
      class="mt-2"
      @click="toggle"
    >
      {{ expanderLabel }}
    </UButton>
  </UCard>
</template>
