<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type Candidate = components['schemas']['ReferenceFoodCandidateResponse']

/** The Food a match is being claimed for — non-null opens the picker. */
export interface Matchable {
  id: number
  name: string
  referenceFoodName?: string | null
}

const props = defineProps<{ food: Matchable | null }>()
const emit = defineEmits<{
  match: [referenceFoodId: number]
  unmatch: []
  close: []
}>()

const { $api } = useNuxtApp()

/**
 * The search, seeded with the Food's own name so the picker opens on an answer
 * rather than an empty box — Tucker suggests and the User taps to accept, which
 * is the whole shape of a match (ADR 0027).
 */
function useCandidates(food: () => Matchable | null) {
  const query = ref('')
  const { data, error, load } = useOptionalFetch(
    (signal) =>
      $api('/api/reference-foods', { query: { q: query.value }, signal }),
    // `latest`, not the default `guard`: every keystroke asks a different
    // question, so a search issued while one is in flight supersedes it. Under
    // `guard` it would be dropped and the list would answer a word the User has
    // already typed past.
    { mode: 'latest' },
  )

  watch(
    food,
    (current) => {
      if (!current) return
      query.value = current.name
      // Cleared before the new search, not merely superseded when it lands: the
      // sheet is one instance the page reassigns, so without this the next Food
      // opens showing the last one's candidates — and a tap on one of those
      // writes that match to this Food (ADR 0027). `useOptionalFetch` guards only
      // the resolve side, and clearing there would strand every caller that keeps
      // its previous answer on screen while a new one loads.
      data.value = null
      error.value = null
      load()
    },
    { immediate: true },
  )

  const candidates = computed<Candidate[]>(() => data.value?.candidates ?? [])
  const suggestedId = computed(() => data.value?.suggestedId ?? null)
  // Read off `data` rather than off `candidates`, whose `?? []` cannot tell a
  // search that came back empty from one that has not come back at all — and
  // saying "no match" before it has is the one thing an empty list must not do.
  // An emptied box is the same mistake in another form: nothing was asked, so a
  // statement about what the database holds would be about no question at all.
  const foundNothing = computed(
    () => query.value.trim().length > 0 && data.value?.candidates.length === 0,
  )
  return { query, candidates, suggestedId, foundNothing, error, search: load }
}

const { query, candidates, suggestedId, foundNothing, error, search } =
  useCandidates(() => props.food)

const searchBox = useTemplateRef<{ inputRef: HTMLInputElement | null }>(
  'searchBox',
)

/**
 * Empty the box, answer the empty query — which reaches nothing by design — and
 * hand the caret back, because clearing is what somebody does when they mean to
 * type. The × itself vanishes at that moment, taking focus with it.
 */
function clearSearch() {
  query.value = ''
  search()
  searchBox.value?.inputRef?.focus()
}

// The length guard is load-bearing, not redundant with the template's v-else-if:
// while a search is in flight `suggestedId` is null and `foundNothing` false, so
// without it this line would render over an empty list on every keystroke.
const willNotGuess = computed(
  () => suggestedId.value === null && candidates.value.length > 0,
)
</script>

<template>
  <ResponsiveOverlay
    :open="food !== null"
    :title="food ? `Match ${food.name}` : ''"
    @update:open="(value) => !value && emit('close')"
  >
    <div class="flex flex-col gap-3">
      <!-- What it borrows now, and the way back out. A wrong match is worse than
           none, so taking one back is as easy as making it (ADR 0027). -->
      <div
        v-if="food?.referenceFoodName"
        class="flex items-center justify-between gap-3 rounded-xl bg-elevated/50 px-3 py-2"
      >
        <p class="min-w-0 text-sm">
          <span class="block text-muted">Currently borrowing from</span>
          <span class="block truncate font-medium text-default">
            {{ food.referenceFoodName }}
          </span>
        </p>
        <UButton
          label="Unmatch"
          color="neutral"
          variant="subtle"
          class="min-h-11 shrink-0"
          @click="emit('unmatch')"
        />
      </div>

      <!-- The sheet's primary control once the suggestion is not the answer, so
           it gets the room a phone needs. It opens holding the Food's own name,
           which is a starting point rather than a value to edit — hence one tap
           that empties it, instead of fourteen backspaces on a phone. -->
      <UInput
        ref="searchBox"
        v-model="query"
        icon="i-lucide-search"
        size="lg"
        placeholder="Search the food database"
        aria-label="Search the food database"
        @update:model-value="search"
      >
        <template v-if="query.length > 0" #trailing>
          <UButton
            aria-label="Clear search"
            icon="i-lucide-x"
            color="neutral"
            variant="link"
            size="sm"
            @click="clearSearch"
          />
        </template>
      </UInput>

      <LoadErrorState
        :error="error"
        title="Couldn't search the food database"
        @retry="search"
      >
        <!-- AFCD is generic staples rather than a retail catalogue, so its
             coverage ceiling is real and an empty answer is the honest one. -->
        <p v-if="foundNothing" class="text-sm text-muted">
          No match in the Australian food database.
        </p>

        <!-- Withholding costs a tap on a listed candidate; guessing costs a week
             of figures for food that was never eaten, invisibly (ADR 0027). -->
        <p v-else-if="willNotGuess" class="text-sm text-muted">
          Tucker isn't sure which of these it is. Pick one, or search for
          something else.
        </p>

        <ul role="list" class="divide-y divide-default">
          <li v-for="candidate in candidates" :key="candidate.id">
            <button
              type="button"
              class="w-full rounded-md py-2.5 text-left hover:bg-elevated active:bg-elevated"
              @click="emit('match', candidate.id)"
            >
              <span class="flex items-baseline gap-2">
                <span class="min-w-0 font-medium text-default">
                  {{ candidate.name }}
                </span>
                <!-- Offered, not applied: nothing is matched silently, because a
                   wrong match reports confident figures for food that was never
                   eaten (ADR 0027). -->
                <UBadge
                  v-if="candidate.id === suggestedId"
                  color="primary"
                  variant="subtle"
                  size="xs"
                  class="shrink-0"
                >
                  Suggested
                </UBadge>
              </span>
              <!-- The same three nutrients on every row, so the list reads down a
                 column: they were chosen for the set, and they are what tells
                 raw chicken from roasted (ADR 0027). -->
              <span class="mt-0.5 block text-xs text-muted">
                {{ distinguishingLine(candidate.distinguishing) }}
              </span>
            </button>
          </li>
        </ul>
      </LoadErrorState>
    </div>
  </ResponsiveOverlay>
</template>
