<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

const props = defineProps<{
  entries: EntryResponse[]
}>()

defineSlots<{
  action?: (props: { entry: EntryResponse }) => unknown
}>()

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
</script>

<template>
  <div>
    <EntryList :entries="visibleEntries">
      <template #action="{ entry }">
        <slot name="action" :entry="entry" />
      </template>
    </EntryList>

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
  </div>
</template>
