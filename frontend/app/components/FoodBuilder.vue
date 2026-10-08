<script setup lang="ts">
// The Food tab of the Add sheet: the form, and the optional barcode pre-fill
// that seeds it. The sheet keys it per opening, so every opening starts clean.
import type { components } from '#open-fetch-schemas/api'

type Candidate = components['schemas']['FoodCandidateResponse']
type Food = components['schemas']['FoodResponse']
type BarcodeLookup = components['schemas']['BarcodeLookupResponse']

const props = defineProps<{
  /** Whether the sheet is open; closing it cancels a look-up in flight. */
  open: boolean
  /** Whether this tab is in view; leaving it releases the camera. */
  inView: boolean
}>()
const emit = defineEmits<{
  submit: [components['schemas']['CreateFoodRequest']]
  /** The barcode belongs to a Food this User already has. */
  found: [Food]
}>()

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
      // candidate's provenance, its barcode, *and* its values: the form seed
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

  return { barcode, looking, branch, inconclusive, lookup, cancel }
}

const { barcode, looking, branch, inconclusive, lookup, cancel } =
  useBarcodeLookup()

// The overlay keeps the sheet mounted while closed, so a late look-up must be
// cancelled here or it could resurface. `cancel()` also marks it superseded, so
// its own continuation stays quiet.
watch(
  () => props.open,
  (open) => {
    if (!open) cancel()
  },
)

// A barcode this User already has a Food for is surfaced rather than dropped
// into a blank form, which would invite a duplicate of a Food they own (ADR 0006).
watch(branch, (current) => {
  if (current.kind === 'existing') emit('found', current.food)
})

/**
 * What the form is seeded with. A Candidate supplies its values, its stated
 * energy as a cross-check, and its Provider's name, so the user knows the values
 * came from a look-up and can correct any (ADR 0007); otherwise only the barcode.
 */
function useFormSeed() {
  const candidate = computed(() =>
    branch.value.kind === 'candidate' ? branch.value.candidate : null,
  )
  const initial = computed(() => {
    const c = candidate.value
    if (!c) return { barcode: barcode.value.trim() || undefined }
    return {
      name: c.name,
      barcode: c.barcode,
      proteinPer100g: c.proteinPer100g ?? undefined,
      carbsPer100g: c.carbsPer100g ?? undefined,
      fatPer100g: c.fatPer100g ?? undefined,
    }
  })
  const statedEnergy = computed(
    () => candidate.value?.statedEnergyKcalPer100g ?? undefined,
  )
  const source = computed(() => candidate.value?.source ?? undefined)
  return { initial, statedEnergy, source }
}
const { initial, statedEnergy, source } = useFormSeed()
</script>

<template>
  <AddFoodForm
    :initial="initial"
    :stated-energy-kcal-per100g="statedEnergy"
    :filled-from-source="source"
    @submit="(payload) => emit('submit', payload)"
  >
    <!-- Optional barcode pre-fill, between the fields and Save so a scanned
         result lands right above the Save button. -->
    <BarcodePrefill
      v-model:barcode="barcode"
      :active="open && inView"
      :looking="looking"
      :inconclusive="inconclusive"
      @lookup="lookup"
    />
  </AddFoodForm>
</template>
