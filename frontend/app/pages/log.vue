<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

import { demoFoods } from '~/prototype/foodTagsDemo'

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

// The catalog: the tail the grid says nothing about, and the read that tells an
// empty catalog from a quiet month. Issued before the ranking is awaited so the
// two overlap, rather than costing the app's most-opened destination two round
// trips before it paints.
const catalogRead = useApi('/api/foods')
const [{ data: catalog, error: catalogError, refresh: refreshCatalog }] =
  await Promise.all([catalogRead, refreshFrequent()])

/** Whether there is a catalog to list or to narrow at all. */
const hasCatalog = computed(() => (catalog.value?.length ?? 0) > 0)

/**
 * A catalog that loaded and holds nothing — the dead end, as opposed to a
 * catalog that failed to load. A User with no Foods can have no rotation, so a
 * failed ranking read tells them nothing they can act on and is not worth a
 * second full-height panel above the one thing that is.
 */
const catalogIsEmpty = computed(
  () => !catalogError.value && catalog.value?.length === 0,
)

/**
 * Narrowing the catalog to a query. A query of whitespace alone is not one, so
 * a stray space cannot collapse the grid — the rule `filterFoods` states, and
 * `filtering` has to agree with it or the two states disagree about what a
 * query is.
 */
function useCatalogFilter() {
  const query = ref('')
  const trimmed = computed(() => query.value.trim())
  const filtering = computed(() => trimmed.value.length > 0)
  const shown = computed(() => filterFoods(catalog.value ?? [], query.value))
  return { query, trimmed, filtering, shown }
}
const filter = useCatalogFilter()

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

// PROTOTYPE — Tag filtering variants over an in-memory demo catalog, on
// `?variant=`. Dev builds only. Delete with components/prototype/.
const PROTO_VARIANTS = [
  { key: 'A', name: 'Chips · ranked within the Tag' },
  { key: 'B', name: 'Chips · a Tag is a query' },
  { key: 'C', name: 'Grouped by Tag, no filter' },
  { key: 'D', name: 'Tag tabs · the Tag is the grid' },
]
const protoRoute = useRoute()
const proto = computed(() =>
  import.meta.dev && protoRoute.query.variant
    ? String(protoRoute.query.variant)
    : null,
)
const protoToast = useToast()
function protoPick(food: { name: string }) {
  protoToast.add({ title: `Spike: would log ${food.name}`, duration: 1500 })
}

/**
 * Both reads failing is one fault and gets one message — the rule the layout
 * already applies to the signed-out shell (`default.vue`): two identical Retry
 * cards read as two things broken. They stay separate otherwise, so neither
 * read can blank the section the other loaded.
 */
const bothFailed = computed(() => !!frequentError.value && !!catalogError.value)
function retryBoth() {
  refreshFrequent()
  refreshCatalog()
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-bold text-default">Log</h1>

    <!-- Always visible and never a popover: a field on a full-height page costs
         nothing when ignored, where a popover makes typing the price of seeing
         anything at all (ADR 0028). Absent only where there is nothing to
         narrow. -->
    <UInput
      v-if="hasCatalog || proto"
      v-model="filter.query.value"
      icon="i-lucide-search"
      placeholder="Filter foods"
      aria-label="Filter foods"
      :ui="{ trailing: 'pe-1' }"
    >
      <!-- Clearing has to be one tap: the way back to the grid cannot be
           holding backspace on a phone. -->
      <template v-if="filter.filtering.value" #trailing>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="link"
          size="sm"
          aria-label="Clear filter"
          @click="filter.query.value = ''"
        />
      </template>
    </UInput>

    <!-- Fixed here in both states: it is the one control whose place must not
         depend on the query, and under the catalog it would sit several screens
         down rather than beside picking a Food as its peer. -->
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

    <template v-if="proto">
      <PrototypeTagsVariantA
        v-if="proto === 'A'"
        :foods="demoFoods"
        :query="filter.query.value"
        @pick="protoPick"
      />
      <PrototypeTagsVariantB
        v-else-if="proto === 'B'"
        :foods="demoFoods"
        :query="filter.query.value"
        @pick="protoPick"
      />
      <PrototypeTagsVariantC
        v-else-if="proto === 'C'"
        :foods="demoFoods"
        :query="filter.query.value"
        @pick="protoPick"
      />
      <PrototypeTagsVariantD
        v-else
        :foods="demoFoods"
        :query="filter.query.value"
        @pick="protoPick"
      />
      <div class="h-24" />
      <PrototypeSwitcher :variants="PROTO_VARIANTS" />
    </template>

    <template v-else>
      <LoadErrorState
        v-if="bothFailed"
        :error="frequentError"
        title="Couldn't load your foods"
        @retry="retryBoth"
      />

      <!-- A query has stopped asking about the rotation, so it collapses the two
         sections into one flat list of matches (ADR 0028) rather than leaving
         ten unrelated Foods above them. The guard takes the whole block, so a
         failed ranking's Retry goes with it: recovering a grid a query is
         hiding is worth nothing, and clearing brings both back. -->
      <LoadErrorState
        v-else-if="!filter.filtering.value && !catalogIsEmpty"
        :error="frequentError"
        title="Couldn't load your frequent foods"
        @retry="refreshFrequent"
      >
        <!-- Absent, not empty, when the window holds nothing: a heading over an
           empty grid promises a rotation the User does not have. It is a named
           region rather than a bare heading because both sections offer a
           "Log <name>" control for a Food in each, so the section is what tells
           the two apart. -->
        <section
          v-if="frequent && frequent.length > 0"
          aria-labelledby="frequent-foods-heading"
        >
          <h2
            id="frequent-foods-heading"
            class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase"
          >
            Frequent foods
          </h2>
          <FrequentFoodsGrid :foods="frequent" @pick="weighed.pick" />
        </section>

        <!-- A stocked catalog and a quiet month: not a dead end, and not a stale
           rotation either — so it says which, rather than leaving the gap above
           the catalog unexplained. -->
        <p v-else-if="hasCatalog" class="py-4 text-center text-sm text-muted">
          Nothing logged in the last 30 days, so there is no rotation to show
          yet.
        </p>
      </LoadErrorState>

      <LoadErrorState
        v-if="!bothFailed"
        :error="catalogError"
        title="Couldn't load your foods"
        @retry="refreshCatalog"
      >
        <FoodEmptyState v-if="!hasCatalog" :to="CATALOG_ADD_ROUTE" />
        <section v-else aria-labelledby="catalog-heading">
          <h2
            id="catalog-heading"
            class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase"
          >
            {{ filter.filtering.value ? 'Matching foods' : 'All foods' }}
          </h2>
          <FoodPickList
            v-if="filter.shown.value.length > 0"
            :foods="filter.shown.value"
            @pick="weighed.pick"
          />
          <!-- Reached only while filtering, since an empty query matches every
             Food — and it names the query rather than saying a bare "nothing
             found", because on a page whose other section has just collapsed
             that is what says the emptiness came from what was typed. -->
          <p v-else class="py-4 text-center text-sm text-muted">
            No foods match “{{ filter.trimmed.value }}”.
          </p>
        </section>
      </LoadErrorState>
    </template>

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
