<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']

const props = defineProps<{ entry: EntryResponse | null }>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

// Name the entry exactly as the Today row reads it (shared formatter), so the
// confirm is unambiguous about which line it removes.
const entryName = computed(() =>
  props.entry ? formatEntryName(props.entry) : '',
)
</script>

<template>
  <UModal
    :open="entry !== null"
    title="Delete this entry?"
    @update:open="(value) => !value && emit('cancel')"
  >
    <template #body>
      <p class="text-sm text-default">
        <span class="font-medium">{{ entryName }}</span> will be removed from
        today's entries. The day's totals re-derive without it.
      </p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="emit('cancel')">Cancel</UButton>
        <UButton color="error" @click="emit('confirm')">Delete</UButton>
      </div>
    </template>
  </UModal>
</template>
