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

const described = computed(() =>
  props.reading
    ? `${props.reading.weightKg.toFixed(1)} kg on ${formatDayHeadingFromISO(props.reading.measuredOn)}`
    : '',
)

/** Deleting the reading; the confirm closes once it is gone. */
function useWeightDeletion() {
  const { $api } = useNuxtApp()
  const { execute } = useApiMutation(
    (reading: Reading) =>
      $api('/api/weight/{id}', {
        method: 'DELETE',
        path: { id: reading.id },
        // The day the Goal-reached check stamps, should the delete cross it.
        query: { clientToday: localToday() },
      }),
    {
      // No success toast: the day's dot and reading leave the card.
      errorTitle: 'Could not delete weight',
      onSuccess: () => {
        emit('close')
        emit('deleted')
      },
    },
  )
  return () => props.reading && execute(props.reading)
}
const deleteWeight = useWeightDeletion()
</script>

<template>
  <ConfirmDeleteDialog
    :open="reading !== null"
    title="Delete this weight?"
    @cancel="emit('close')"
    @confirm="deleteWeight"
  >
    <span class="font-medium">{{ described }}</span> will be removed, and your
    trend weight re-derives without it.
  </ConfirmDeleteDialog>
</template>
