<script setup lang="ts">
const { $api } = useNuxtApp()

const today = useLocalDay()
const picked = ref(today.value)
const plain = computed(() => formatDayHeadingFromISO(picked.value))

/** Every reading the User has taken, read once for the visit. */
function useReadings() {
  const {
    data,
    error,
    load: read,
  } = useOptionalFetch(() => $api('/api/weight'))
  /** Whether the first read has come back; until then no day is known empty. */
  const answered = ref(false)
  async function load() {
    await read()
    answered.value = true
  }
  const days = computed(() => (data.value ?? []).map((r) => r.measuredOn))
  const pickedReading = computed(
    () => (data.value ?? []).find((r) => r.measuredOn === picked.value) ?? null,
  )
  return { days, pickedReading, answered, error, load }
}
const readings = useReadings()
// Not awaited: a read nothing else on /review needs must not hold the page's
// Suspense, which waits on every awaited setup beneath it.
void readings.load()

const emit = defineEmits<{
  /** A reading was saved, so the figures derived from the readings moved. */
  saved: []
}>()

/**
 * Adds or corrects the picked day's reading; the sheet locks its date to it,
 * and the server replaces a day's reading rather than adding a second.
 */
function usePickedDayLogging() {
  return useWeightLogging({
    today: () => today.value,
    // No success toast: the day's dot and reading appear in the card itself.
    onSaved: async () => {
      emit('saved')
      await readings.load()
    },
  })
}
const logging = usePickedDayLogging()
</script>

<template>
  <UCard role="region" aria-labelledby="weight-history-heading">
    <h2 id="weight-history-heading" class="text-h2 text-highlighted">
      Weight history
    </h2>
    <LoadErrorState
      :error="readings.error.value"
      title="Couldn't load your weight history"
      nested
      class="mt-3"
      @retry="readings.load"
    />
    <!-- Hidden rather than unmounted, so the calendar keeps the month it was
         showing through a failure and its retry. -->
    <div v-show="!readings.error.value">
      <AppCalendar
        v-model="picked"
        :max="today"
        :marked="readings.days.value"
        class="mt-3"
      />
      <USeparator class="my-3" />
      <!-- The cold load only: a refetch keeps the last answer up. Decorative,
           so hidden from assistive tech, as the Day Lookup's is. -->
      <USkeleton
        v-if="!readings.answered.value"
        aria-hidden="true"
        class="appear-late h-8 w-1/3"
      />
      <div
        v-else-if="readings.pickedReading.value"
        class="flex items-center justify-between gap-3"
      >
        <p class="text-stat text-default">
          {{ readings.pickedReading.value.weightKg.toFixed(1) }} kg
        </p>
        <UButton
          variant="ghost"
          icon="i-lucide-pencil"
          :aria-label="`Edit weight on ${plain}`"
          @click="logging.sheetOpen.value = true"
        />
      </div>
      <template v-else>
        <p class="text-sm text-muted">No weight on {{ plain }}.</p>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          class="mt-3"
          @click="logging.sheetOpen.value = true"
        >
          Add weight
        </UButton>
      </template>
    </div>
    <LogWeightSheet
      v-model:open="logging.sheetOpen.value"
      :date="picked"
      :initial-weight-kg="readings.pickedReading.value?.weightKg"
      :pending="logging.saving.value"
      @submit="logging.logWeight"
    />
  </UCard>
</template>
