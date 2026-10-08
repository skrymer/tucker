<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

const props = defineProps<{ entry: EntryResponse | null }>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

// The entry named with its figures, so the confirm is unambiguous about which
// line it removes. One string, where the Today row lays the same words over two:
// a dialog's prose has nowhere to put a second line.
const entryName = computed(() =>
  props.entry ? formatEntryName(props.entry) : '',
)
</script>

<template>
  <ConfirmDeleteDialog
    :open="entry !== null"
    title="Delete this entry?"
    @cancel="emit('cancel')"
    @confirm="emit('confirm')"
  >
    <span class="font-medium">{{ entryName }}</span> will be removed, and that
    day's totals re-derive without it.
  </ConfirmDeleteDialog>
</template>
