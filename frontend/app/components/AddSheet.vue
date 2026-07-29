<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'

type Candidate = components['schemas']['FoodCandidateResponse']
type Food = components['schemas']['FoodResponse']

const props = defineProps<{
  open: boolean
  /**
   * A Food the parent has just persisted through this flow (the POST response).
   * Its presence flips the sheet from "add" to the "log it now" continuation.
   */
  createdFood?: Food | null
  /** The catalog, for the recipe builder's ingredient picker (recipes excluded). */
  foods?: Food[]
  /** True while a recipe save is in flight, to lock the builder's Save. */
  recipePending?: boolean
  /** A Food just persisted from the recipe builder's inline "Add a new food". */
  createdIngredient?: Food | null
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  submit: [
    {
      name: string
      barcode?: string
      proteinPer100g: number
      carbsPer100g: number
      fatPer100g: number
    },
  ]
  'submit-recipe': [
    {
      name: string
      cookedWeightG: number
      ingredients: { foodId: number; grams: number }[]
    },
  ]
  'create-food': [
    {
      name: string
      barcode?: string
      proteinPer100g: number
      carbsPer100g: number
      fatPer100g: number
    },
  ]
  log: [{ foodId: number; grams: number }]
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

function useBarcodeLookup() {
  const { $api } = useNuxtApp()
  const barcode = ref('')
  const branch = ref<Branch>({ kind: 'manual' })
  /**
   * Whether the blank form arrived without a verdict behind it. A miss stays
   * false and says something true by saying nothing — nothing has this barcode,
   * so an empty form *is* the answer. An **Inconclusive Lookup** is the opposite:
   * the same blank form would assert the product is unknown, which is precisely
   * what nobody managed to find out (ADR 0006, issue #164).
   */
  const inconclusive = ref(false)

  // The look-up runs through the shared async primitive (ADR 0007): a newer
  // barcode supersedes an in-flight one (`latest`), a hung connection times out
  // to manual entry, and `busy` is the delayed flag the Look-up button shows.
  const {
    busy: looking,
    run,
    cancel,
  } = useAsyncAction(
    (signal: AbortSignal, code: string) =>
      $api('/api/foods/barcode/{barcode}', {
        path: { barcode: code },
        // Never serve a stale result from the browser cache: the resolution is
        // dynamic (a barcode flips from Candidate to existing Food once saved,
        // and a transient miss must not stick), so each look-up must be fresh.
        cache: 'no-store',
        // No auto-retry: ofetch retries a GET once by default and 503 is in its
        // stock retryStatusCodes, which re-adds one layer up the Provider-load
        // multiplication the backend deliberately refuses (issue #164, ADR 0007).
        retry: 0,
        signal,
      }),
    { mode: 'latest', timeoutMs: 8000 },
  )

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
      // candidate's provenance *and* its barcode, so a save can no longer file one
      // product under another's code — the note tells the user to fill in the
      // details above, and they must not be another product's details.
      //
      // It does not blank the fields themselves: `AddFoodForm` fills only what is
      // non-null (ADR 0007's merge), so an earlier candidate's name and macros
      // stay on screen, editable, under the new barcode. Withdrawing them would
      // mean either remounting the form — the #58 data-loss bug — or changing that
      // merge for every flow, so it is tracked as issue #180.
      if (outcome.status === 'timedOut') {
        branch.value = { kind: 'manual' }
        inconclusive.value = true
        return
      }
      const result = outcome.value
      branch.value =
        result.outcome === 'EXISTING' && result.food
          ? { kind: 'existing', food: result.food }
          : result.candidate
            ? { kind: 'candidate', candidate: result.candidate }
            : { kind: 'manual' }
    } catch (error) {
      // Either way manual entry carries the barcode, exactly where a deliberate
      // manual add starts — but only a 404 has earned the silence. Anything else
      // means no source could be reached, and saying nothing would let the blank
      // form imply the product does not exist.
      branch.value = { kind: 'manual' }
      inconclusive.value = !isNotFound(error)
    }
  }

  function reset() {
    // Abort any in-flight look-up so a late result can't resurface after the
    // sheet is dismissed. `cancel()` also marks it superseded, so its own
    // continuation stays quiet.
    cancel()
    barcode.value = ''
    branch.value = { kind: 'manual' }
    inconclusive.value = false
  }

  return { barcode, looking, branch, inconclusive, lookup, reset }
}

const { barcode, looking, branch, inconclusive, lookup, reset } =
  useBarcodeLookup()

// The camera scanner is a peer input to the manual field, lazy-loading
// zxing-wasm behind the Scan tap (ADR 0006).
const {
  state: scanState,
  videoEl,
  barcode: scannedBarcode,
  start: startScan,
  stop: stopScan,
} = useBarcodeScanner()

// A camera-decoded barcode runs the exact same lookup/branch as a typed one.
watch(scannedBarcode, (code) => {
  if (!code) return
  barcode.value = code
  lookup()
})

// Leaving the Food tab must release the camera: the scanner lives in this
// sheet's scope (not the tab panel), so switching to the Recipe builder wouldn't
// otherwise stop it — leaving the light on, and letting a stray decode hijack
// the sheet (ADR 0006, "never leave the camera light on").
watch(mode, (current) => {
  if (current !== 'food') stopScan()
})

// Release the camera whenever the sheet is dismissed — by the overlay or by the
// parent flipping `open` after a save. The overlay keeps this component mounted
// while closed, so onScopeDispose alone would leave the camera light on.
watch(
  () => props.open,
  (open) => {
    if (!open) {
      stopScan()
      // Start clean on the next open: a stale catalog hit or candidate must not
      // resurface after the sheet has been dismissed (e.g. once a Food is saved
      // and the continuation closes).
      reset()
      // Remount the add form on the next open so typed/merged values don't
      // linger across opens (within one open it stays mounted; see formSession).
      formSession.value++
      // Reopen on the Food builder — the mode is a per-session choice.
      mode.value = 'food'
    }
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

// Once a Food exists, scanning is done — offer the explicit next step of logging
// it (issue #52, "scanning creates a Food, not an Entry"). A catalog hit surfaces
// an existing Food straight away; a saved Candidate/manual entry comes back from
// the parent as `createdFood`. Either way the user still enters grams.
const loggable = computed<{
  food: Food
  origin: 'created' | 'existing'
} | null>(() => {
  if (branch.value.kind === 'existing')
    return { food: branch.value.food, origin: 'existing' }
  if (props.createdFood) return { food: props.createdFood, origin: 'created' }
  return null
})
</script>

<template>
  <ResponsiveOverlay
    :open="open"
    :title="mode === 'recipe' ? 'Add recipe' : 'Add food'"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="flex flex-col gap-4 pb-4">
      <!-- Once a Food exists (catalog hit or just saved), the flow pivots to the
           offered "log it now" continuation. Otherwise the food details lead:
           manual entry is the primary, always-available path, and a barcode is
           just an optional way to pre-fill those fields. A saved Recipe is a
           Food too, so it pivots into the very same continuation. -->
      <LogItNow
        v-if="loggable"
        :food="loggable.food"
        :origin="loggable.origin"
        @log="(payload) => emit('log', payload)"
        @dismiss="emit('update:open', false)"
      />
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
            <!-- Optional barcode pre-fill, between the fields and Save so a scanned
             result lands right above the Save button. -->
            <USeparator label="or pre-fill from a barcode" />

            <div class="flex flex-col gap-3">
              <p class="text-center text-xs text-muted">
                Scan or type a product's barcode to fill in the details above.
              </p>

              <!-- No source could be reached, so the blank form above would
                   otherwise assert something nobody established (issue #164).
                   An inline note, not a toast: this surface is already in focus,
                   and a look-up failure is not a mutation failure (ADR 0005 /
                   0007). No Retry button either — "Look up" is right below. -->
              <UAlert
                v-if="inconclusive"
                icon="i-lucide-cloud-off"
                color="warning"
                variant="subtle"
                title="Couldn't look that up"
                description="The lookup didn't get through, so Tucker can't say whether this product is known. Try again in a moment, or just fill in the details above."
              />

              <UButton
                v-if="scanState === 'idle' || scanState === 'decoded'"
                block
                icon="i-lucide-scan-barcode"
                color="primary"
                variant="subtle"
                @click="startScan"
              >
                Scan barcode
              </UButton>

              <UButton
                v-else-if="scanState === 'requesting'"
                block
                color="primary"
                variant="subtle"
                loading
                disabled
              >
                Requesting camera…
              </UButton>

              <div
                v-else-if="scanState === 'scanning'"
                class="relative overflow-hidden rounded-lg bg-black"
              >
                <video
                  ref="videoEl"
                  class="max-h-[45vh] w-full object-cover"
                  playsinline
                  muted
                  autoplay
                  aria-hidden="true"
                ></video>
                <p
                  class="absolute inset-x-0 top-2 text-center text-sm font-medium text-white drop-shadow"
                >
                  Point the camera at a barcode
                </p>
                <UButton
                  class="absolute inset-x-0 bottom-3 mx-auto w-fit"
                  color="neutral"
                  variant="solid"
                  icon="i-lucide-square"
                  @click="stopScan"
                >
                  Stop
                </UButton>
              </div>

              <UAlert
                v-if="scanState === 'denied'"
                icon="i-lucide-camera-off"
                color="warning"
                variant="subtle"
                title="Camera access is blocked"
                description="Enable it in your device settings, or enter the barcode below."
              />

              <UAlert
                v-else-if="scanState === 'unsupported'"
                icon="i-lucide-camera-off"
                color="neutral"
                variant="subtle"
                title="Camera scanning isn't available here"
                description="Enter the barcode below instead."
              />

              <!-- Not a <form>: this lives inside AddFoodForm's <form>, and nested
               forms are invalid. Look up is a button; Enter triggers it too. -->
              <div class="flex items-end gap-2">
                <UFormField
                  label="Barcode"
                  hint="optional"
                  name="barcode"
                  class="flex-1"
                >
                  <UInput
                    v-model="barcode"
                    inputmode="numeric"
                    placeholder="Type a barcode number"
                    class="w-full"
                    @keydown.enter.prevent="lookup"
                  />
                </UFormField>
                <UButton
                  type="button"
                  color="neutral"
                  variant="subtle"
                  :loading="looking"
                  @click="lookup"
                >
                  Look up
                </UButton>
              </div>
            </div>
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
