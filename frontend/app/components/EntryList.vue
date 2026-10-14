<!--
  Every Entry it is given, uncapped, as Tucker draws a row: its name, its
  figures grams first, and the estimate badge. The far end of a row is the
  caller's (`action`), since only it knows whether an Entry can be acted on
  there.
-->
<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{ entries: EntryResponse[] }>()
</script>

<template>
  <ul class="divide-y divide-default">
    <li
      v-for="entry in entries"
      :key="entry.id"
      class="flex items-center justify-between gap-2 py-2"
    >
      <FigureRow
        class="flex-1"
        :name="entry.name"
        :figures="formatEntryFigures(entry)"
      >
        <template #marker>
          <EstimateBadge v-if="entry.isEstimate" />
        </template>
      </FigureRow>
      <slot name="action" :entry="entry" />
    </li>
  </ul>
</template>
