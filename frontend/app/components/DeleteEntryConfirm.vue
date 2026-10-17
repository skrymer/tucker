<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

const props = defineProps<{ entry: EntryResponse | null; pending?: boolean }>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

// The entry named with its figures, so the confirm is unambiguous about which
// line it removes. One string, where the Today row lays the same words over two:
// a dialog's prose has nowhere to put a second line. Held on the last Entry
// asked about while the dialog animates closed.
const entryName = computed<string>((last) =>
  props.entry ? formatEntryName(props.entry) : (last ?? ''),
)
</script>

<template>
  <ConfirmDeleteDialog
    :open="entry !== null"
    title="Delete this entry?"
    :pending="pending"
    @cancel="emit('cancel')"
    @confirm="emit('confirm')"
  >
    <span class="font-medium">{{ entryName }}</span> will be removed, and that
    day's totals re-derive without it.
  </ConfirmDeleteDialog>
</template>
