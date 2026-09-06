<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const { $api } = useNuxtApp()

/**
 * The Foods this User reaches for most (CONTEXT.md — Frequent Foods). The window
 * is derived per load rather than captured at setup: a page left open over
 * midnight whose Retry is tapped at 00:03 must ask about the 30 days it is now.
 *
 * `latest`, not the default `guard`: logging an Entry invalidates the ranking, so
 * a reload issued while one is in flight asks a question the answer in flight
 * predates, and dropping it would leave the grid a mutation out of date.
 */
const {
  data: frequent,
  error: frequentError,
  load: refreshFrequent,
} = useOptionalFetch(
  (signal) =>
    $api('/api/foods/frequent', {
      query: trailingWindow(FREQUENT_FOODS_WINDOW_DAYS),
      signal,
    }),
  { mode: 'latest' },
)

// The catalog, read only to tell an empty one from a quiet month: both leave the
// grid with nothing to draw, and only one of them is a dead end. Issued before
// the ranking is awaited so the two overlap, rather than costing the app's
// most-opened destination two round trips before it paints.
const catalogRead = useApi('/api/foods')
const [{ data: catalog, error: catalogError, refresh: refreshCatalog }] =
  await Promise.all([catalogRead, refreshFrequent()])

/** Picking a Food out of the grid, and weighing it in the sheet that opens. */
function usePickedFood(onLogged: () => Promise<void>) {
  const picked = ref<FoodResponse | null>(null)
  const gate = useWeighedEntryLog({
    onLogged: async () => {
      picked.value = null
      await onLogged()
    },
  })

  return {
    ...gate,
    picked,
    pick: (food: FoodResponse) => {
      gate.reset()
      picked.value = food
    },
    close: () => {
      gate.reset()
      picked.value = null
    },
  }
}
// The ranking counts Entries, so the one just logged can move a cell.
const weighed = usePickedFood(refreshFrequent)

/** An estimate — a peer of picking a Food, since it names none for the grid to hold. */
function useEstimate() {
  const open = ref(false)
  const gate = useEstimatedEntryLog({
    onLogged: () => {
      open.value = false
    },
  })
  // Closing the sheet abandons the entry, so its warning has to go with it: the
  // form unmounts and reopens blank, and a warning outliving it would state a
  // figure about an entry that no longer exists.
  watch(open, (isOpen) => {
    if (!isOpen) gate.reset()
  })
  return { ...gate, open }
}
const estimate = useEstimate()
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-bold text-default">Log</h1>

    <LoadErrorState
      :error="frequentError"
      title="Couldn't load your frequent foods"
      @retry="refreshFrequent"
    >
      <!-- Absent, not empty, when the window holds nothing: a heading over an
           empty grid promises a rotation the User does not have. -->
      <template v-if="frequent && frequent.length > 0">
        <!-- A heading, though it is drawn as a small label: slice 2 puts the
             full catalog under a second one, and a page whose sections are
             paragraphs cannot be navigated by them. -->
        <h2
          class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase"
        >
          Frequent foods
        </h2>
        <FrequentFoodsGrid :foods="frequent" @pick="weighed.pick" />
      </template>

      <!-- The catalog only decides what to say where the ranking has nothing to
           show, so a failed catalog read can never blank a grid that loaded. -->
      <LoadErrorState
        v-else
        :error="catalogError"
        title="Couldn't load your foods"
        @retry="refreshCatalog"
      >
        <FoodEmptyState v-if="catalog?.length === 0" :to="CATALOG_ADD_ROUTE" />
        <!-- A stocked catalog and a quiet month: not a dead end, and not a
             stale rotation either — so it says which, rather than leaving a
             primary destination blank. Slice 2 puts the full catalog here. -->
        <p v-else-if="catalog" class="py-8 text-center text-sm text-muted">
          Nothing logged in the last 30 days, so there is no rotation to show
          yet.
        </p>
      </LoadErrorState>
    </LoadErrorState>

    <UButton
      icon="i-lucide-pencil-line"
      color="neutral"
      variant="outline"
      block
      @click="
        () => {
          estimate.open.value = true
        }
      "
    >
      Log an estimate instead
    </UButton>

    <LogGramsSheet
      :food="weighed.picked.value"
      :warning="weighed.warning.value"
      :pending="weighed.pending.value"
      @log="weighed.log"
      @edited="weighed.reset"
      @close="weighed.close"
    />

    <ResponsiveOverlay
      v-model:open="estimate.open.value"
      title="Log an estimate"
    >
      <EstimatedEntryForm
        :warning="estimate.warning.value"
        :pending="estimate.pending.value"
        @submit="estimate.log"
        @edited="estimate.reset"
      />
    </ResponsiveOverlay>
  </section>
</template>
