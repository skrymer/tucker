<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type Reading = components['schemas']['WeightMeasurementResponse']

// Stryker disable next-line all: a compiler macro must stay a top-level statement
const props = defineProps<{ reading: Reading | null }>()

const emit = defineEmits<{
  close: []
  /** The reading is gone, so whatever was derived from it has moved. */
  deleted: []
}>()

/** The last reading asked about, held while the dialog animates closed. */
const asked = computed<Reading | null>((last) => props.reading ?? last ?? null)

const described = computed(() =>
  asked.value
    ? `${asked.value.weightKg.toFixed(1)} kg on ${formatDayHeadingFromISO(asked.value.measuredOn)}`
    : '',
)

/**
 * Deleting the reading; the confirm closes once it is gone — unless it has
 * since moved on to another reading, as a late Retry of a failed delete finds.
 */
function useWeightDeletion() {
  const { $api } = useNuxtApp()
  let deleting: Reading | null = null
  const { pending, execute } = useApiMutation(
    (reading: Reading) => {
      deleting = reading
      return $api('/api/weight/{id}', {
        method: 'DELETE',
        path: { id: reading.id },
        // The day the Goal-reached check stamps, should the delete cross it.
        query: { clientToday: localToday() },
      })
    },
    {
      // No success toast: the day's dot and reading leave the card.
      errorTitle: 'Could not delete weight',
      onSuccess: () => {
        if (props.reading?.id === deleting?.id) emit('close')
        emit('deleted')
      },
    },
  )
  return {
    pending,
    confirm: () => props.reading && execute(props.reading),
  }
}
const deletion = useWeightDeletion()
</script>

<template>
  <ConfirmDeleteDialog
    :open="reading !== null"
    title="Delete this weight?"
    :pending="deletion.pending.value"
    @cancel="emit('close')"
    @confirm="deletion.confirm"
  >
    <span class="font-medium">{{ described }}</span> will be removed, and your
    trend weight re-derives without it.
  </ConfirmDeleteDialog>
</template>
