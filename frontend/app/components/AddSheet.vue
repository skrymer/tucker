<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'

type Candidate = components['schemas']['FoodCandidateResponse']
type Food = components['schemas']['FoodResponse']
type NewFood = components['schemas']['CreateFoodRequest']
type BarcodeLookup = components['schemas']['BarcodeLookupResponse']

const props = defineProps<{
  open: boolean
  /** The catalog, for the recipe builder's ingredient picker (recipes excluded). */
  foods?: Food[]
  /** True while a recipe save is in flight, to lock the builder's Save. */
  recipePending?: boolean
  /** A Food just persisted from the recipe builder's inline "Add a new food". */
  createdIngredient?: Food | null
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  submit: [NewFood]
  'submit-recipe': [components['schemas']['CreateRecipeRequest']]
  'create-food': [NewFood]
}>()

// The overlay hosts two builders (CONTEXT.md): a plain Food (with its barcode
// pre-fill) or a composite Recipe. Food leads by default.
const mode = ref<'food' | 'recipe'>('food')
const modeItems: TabsItem[] = [
  { value: 'food', label: 'Food', slot: 'food' },
  { value: 'recipe', label: 'Recipe', slot: 'recipe' },
]

/**
 * The barcode-lookup half of the Add-Food flow (ADR 0006). Resolves a barcode —
 * typed or camera-decoded — through the backend and branches: a provider
 * Candidate pre-fills the form, an existing Food is surfaced, a miss (or
 * offline) drops to manual entry with the barcode pre-filled. Manual entry is an
 * always-on peer, never gated.
 */
type Branch =
  | { kind: 'manual' }
  | { kind: 'candidate'; candidate: Candidate }
  | { kind: 'existing'; food: Food }

function branchFor(result: BarcodeLookup): Branch {
  if (result.outcome === 'EXISTING' && result.food)
    return { kind: 'existing', food: result.food }
  if (result.candidate)
    return { kind: 'candidate', candidate: result.candidate }
  return { kind: 'manual' }
}

/**
 * The look-up runs through the shared async primitive (ADR 0007): a newer
 * barcode supersedes an in-flight one (`latest`), a hung connection times out
 * to manual entry, and `busy` is the delayed flag the Look-up button shows.
 */
function useBarcodeRequest() {
  const { $api } = useNuxtApp()
  return useAsyncAction(
    (signal: AbortSignal, code: string) =>
      $api('/api/foods/barcode/{barcode}', {
        path: { barcode: code },
        // Never serve a stale result from the browser cache: the resolution is
        // dynamic (a barcode flips from Candidate to existing Food once saved,
        // and a transient miss must not stick), so each look-up must be fresh.
        cache: 'no-store',
        // No auto-retry: ofetch retries a GET once by default and 503 is in its
        // stock retryStatusCodes, which re-adds one layer up the Provider-load
        // multiplication the backend deliberately refuses (ADR 0007).
        retry: 0,
        signal,
      }),
    { mode: 'latest', timeoutMs: 8000 },
  )
}

function useBarcodeLookup() {
  const barcode = ref('')
  const branch = ref<Branch>({ kind: 'manual' })
  /**
   * Whether the blank form arrived without a verdict behind it. A miss stays
   * false and says something true by saying nothing — nothing has this barcode,
   * so an empty form *is* the answer. An **Inconclusive Lookup** is the opposite:
   * the same blank form would assert the product is unknown, which is precisely
   * what nobody managed to find out (ADR 0006).
   */
  const inconclusive = ref(false)
  const { busy: looking, run, cancel } = useBarcodeRequest()

  function settle(next: Branch, unanswered: boolean) {
    branch.value = next
    inconclusive.value = unanswered
  }

  async function lookup() {
    const code = barcode.value.trim()
    if (!code) return
    inconclusive.value = false
    try {
      const outcome = await run(code)
      // Superseded by a newer barcode, or cancelled: leave the screen to whoever
      // replaced us.
      if (outcome.status === 'superseded') return
      // A hung connection settles nothing, exactly like an unreachable source, so
      // it drops the same way: back to manual entry. That withdraws the previous
      // candidate's provenance, its barcode, *and* its values: `formInitial`
      // stops supplying them, and an untouched field mirrors its seed (ADR 0007),
      // so they clear with it. The note tells the user to fill in the details
      // above, and they must not be another product's details.
      if (outcome.status === 'timedOut') settle({ kind: 'manual' }, true)
      else settle(branchFor(outcome.value), false)
    } catch (error) {
      // Either way manual entry carries the barcode, exactly where a deliberate
      // manual add starts — but only a 404 has earned the silence. Anything else
      // means no source could be reached, and saying nothing would let the blank
      // form imply the product does not exist.
      settle({ kind: 'manual' }, !isNotFound(error))
    }
  }

  function reset() {
    // Abort any in-flight look-up so a late result can't resurface after the
    // sheet is dismissed. `cancel()` also marks it superseded, so its own
    // continuation stays quiet.
    cancel()
    barcode.value = ''
    settle({ kind: 'manual' }, false)
  }

  return { barcode, looking, branch, inconclusive, lookup, cancel, reset }
}

const { barcode, looking, branch, inconclusive, lookup, cancel, reset } =
  useBarcodeLookup()

watch(
  () => props.open,
  (open) => {
    if (!open) {
      // The overlay keeps this component mounted while closed, so a late
      // look-up must be cancelled here or it could resurface. The barcode
      // pre-fill releases the camera on the same signal.
      cancel()
      return
    }
    // Everything else starts clean on the way *in*, not on the way out: the
    // overlay holds this component through its exit animation, so a reset on
    // close is watched — the header retitles and a blank Food form slides out in
    // place of whatever the User just saved.
    //
    // A stale catalog hit or candidate must not resurface; the form is remounted
    // so typed and merged values don't linger across opens (within one open it
    // stays mounted, see formSession); and the mode is a per-session choice.
    reset()
    formSession.value++
    mode.value = 'food'
  },
)

const formInitial = computed(() => {
  if (branch.value.kind === 'candidate') {
    const c = branch.value.candidate
    return {
      name: c.name,
      barcode: c.barcode,
      proteinPer100g: c.proteinPer100g ?? undefined,
      carbsPer100g: c.carbsPer100g ?? undefined,
      fatPer100g: c.fatPer100g ?? undefined,
    }
  }
  return { barcode: barcode.value.trim() || undefined }
})

const statedEnergy = computed(() =>
  branch.value.kind === 'candidate'
    ? (branch.value.candidate.statedEnergyKcalPer100g ?? undefined)
    : undefined,
)

// When a candidate has pre-filled the form, name its Provider so the user knows
// the values came from a look-up and can correct any (ADR 0007).
const filledFromSource = computed(() =>
  branch.value.kind === 'candidate'
    ? (branch.value.candidate.source ?? undefined)
    : undefined,
)

// Re-key the form per open, not per lookup result: within one open the form is
// never remounted, so a resolving look-up merges into it (ADR 0007) instead of
// wiping what the user has typed; reopening the sheet starts a fresh form.
const formSession = ref(0)

// A barcode this User already has a Food for. Surfaced rather than dropped into
// a blank form, which would invite a duplicate of a Food they own (ADR 0006);
// the Food itself is the answer, and there is nothing to do with it here.
const existingFood = computed<Food | null>(() =>
  branch.value.kind === 'existing' ? branch.value.food : null,
)
</script>

<template>
  <ResponsiveOverlay
    :open="open"
    :title="mode === 'recipe' ? 'Add recipe' : 'Add food'"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="flex flex-col gap-4 pb-4">
      <!-- A barcode already in the catalog answers the whole flow: there is
           nothing to add. Otherwise the food details lead — manual entry is the
           primary, always-available path, and a barcode is just an optional way
           to pre-fill those fields. -->
      <div v-if="existingFood" class="flex flex-col gap-4">
        <UAlert
          icon="i-lucide-check"
          color="success"
          variant="subtle"
          title="Already in your catalog"
          :description="formatName(existingFood.name)"
        />
        <UButton
          type="button"
          color="primary"
          class="w-full"
          @click="emit('update:open', false)"
        >
          Done
        </UButton>
      </div>
      <UTabs
        v-else
        v-model="mode"
        :items="modeItems"
        color="primary"
        class="w-full"
        :unmount-on-hide="false"
      >
        <template #food>
          <AddFoodForm
            :key="formSession"
            :initial="formInitial"
            :stated-energy-kcal-per100g="statedEnergy"
            :filled-from-source="filledFromSource"
            class="mt-4"
            @submit="(payload) => emit('submit', payload)"
          >
            <!-- Optional barcode pre-fill, between the fields and Save so a
                 scanned result lands right above the Save button. -->
            <BarcodePrefill
              v-model:barcode="barcode"
              :active="open && mode === 'food'"
              :looking="looking"
              :inconclusive="inconclusive"
              @lookup="lookup"
            />
          </AddFoodForm>
        </template>

        <template #recipe>
          <RecipeBuilder
            :key="formSession"
            :foods="foods ?? []"
            :pending="recipePending"
            :created-ingredient="createdIngredient"
            class="mt-4"
            @submit="(payload) => emit('submit-recipe', payload)"
            @create-food="(payload) => emit('create-food', payload)"
          />
        </template>
      </UTabs>
    </div>
  </ResponsiveOverlay>
</template>
