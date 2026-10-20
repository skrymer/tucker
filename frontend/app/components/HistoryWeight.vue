<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type Reading = components['schemas']['WeightMeasurementResponse']

// Stryker disable next-line all: a compiler macro must stay a top-level statement
const props = defineProps<{
  /** The picked day, ISO `yyyy-mm-dd`. */
  day: string
  /** The User's local day, ISO: a save's validation anchor and the line no reading crosses. */
  today: string
  /** The day's reading; null when it has none. */
  reading: Reading | null
  /** Whether the readings' first read has come back; until then no day is known empty. */
  answered: boolean
  /** The readings' last read failing. */
  error: unknown
}>()

const emit = defineEmits<{
  /** A reading was saved or deleted, so the figures derived from them moved. */
  changed: []
  retry: []
}>()

const plain = computed(() => formatDayHeadingFromISO(props.day))
/** A day still to come, which no reading can be taken on yet. ISO days order as text. */
const ahead = computed(() => props.day > props.today)

/**
 * Adds or corrects the day's reading; the sheet locks its date to it, and the
 * server replaces a day's reading rather than adding a second.
 */
const logging = useWeightLogging({
  today: () => props.today,
  // No success toast: the day's mark and reading appear in the card itself.
  onSaved: () => emit('changed'),
})

/** The reading the confirm is asking about; null while it is shut. */
const toDelete = ref<Reading | null>(null)
</script>

<template>
  <div>
    <!-- Its own error: the calendar and the Entries keep working without the
         readings, only the rings go. The sheets below stay mounted through it. -->
    <LoadErrorState
      :error="error"
      title="Couldn't load your weight history"
      nested
      @retry="emit('retry')"
    >
      <!-- The cold load only: a refetch keeps the last answer up. Decorative,
         so hidden from assistive tech. -->
      <USkeleton
        v-if="!answered"
        aria-hidden="true"
        class="appear-late h-8 w-1/3"
      />
      <div v-else-if="reading" class="flex items-center justify-between gap-3">
        <p class="text-stat text-default">
          {{ reading.weightKg.toFixed(1) }} kg
        </p>
        <div class="flex items-center gap-1">
          <RowActionButton
            action="edit"
            :aria-label="`Edit weight on ${plain}`"
            @click="logging.sheetOpen.value = true"
          />
          <RowActionButton
            action="delete"
            :aria-label="`Delete weight on ${plain}`"
            @click="toDelete = reading"
          />
        </div>
      </div>
      <p v-else-if="ahead" class="text-sm text-muted">
        Weigh in on the day itself.
      </p>
      <template v-else>
        <p class="text-sm text-muted">No weight.</p>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          class="mt-3"
          @click="logging.sheetOpen.value = true"
        >
          Add weight
        </UButton>
      </template>
    </LoadErrorState>
    <DeleteWeightConfirm
      :reading="toDelete"
      @close="toDelete = null"
      @deleted="emit('changed')"
    />
    <LogWeightSheet
      v-model:open="logging.sheetOpen.value"
      :date="day"
      :initial-weight-kg="reading?.weightKg"
      :pending="logging.saving.value"
      @submit="logging.logWeight"
    />
  </div>
</template>
