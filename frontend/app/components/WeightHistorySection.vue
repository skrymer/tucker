<script setup lang="ts">
const { $api } = useNuxtApp()

const picked = ref(localToday())
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

/** Adds a reading to the picked day; the sheet locks its date to it. */
function useBackfill() {
  const { sheetOpen, saving, logWeight } = useWeightLogging({
    today: () => localToday(),
    // No success toast: the day's dot and reading appear in the card itself.
    onSaved: async () => {
      emit('saved')
      await readings.load()
    },
  })
  return { sheetOpen, saving, logWeight }
}
const backfill = useBackfill()
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
        :max="localToday()"
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
      <p
        v-else-if="readings.pickedReading.value"
        class="text-stat text-default"
      >
        {{ readings.pickedReading.value.weightKg.toFixed(1) }} kg
      </p>
      <template v-else>
        <p class="text-sm text-muted">No weight on {{ plain }}.</p>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          class="mt-3"
          @click="backfill.sheetOpen.value = true"
        >
          Add weight
        </UButton>
      </template>
    </div>
    <LogWeightSheet
      v-model:open="backfill.sheetOpen.value"
      :date="picked"
      :pending="backfill.saving.value"
      @submit="backfill.logWeight"
    />
  </UCard>
</template>
