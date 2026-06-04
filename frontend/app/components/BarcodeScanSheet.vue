<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type Candidate = components['schemas']['FoodCandidateResponse']
type Food = components['schemas']['FoodResponse']

const props = defineProps<{ open: boolean }>()

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

function useBarcodeLookup() {
  const { $api } = useNuxtApp()
  const barcode = ref('')
  const looking = ref(false)
  const branch = ref<Branch>({ kind: 'manual' })

  async function lookup() {
    const code = barcode.value.trim()
    if (!code || looking.value) return
    looking.value = true
    try {
      const result = await $api('/api/foods/barcode/{barcode}', {
        path: { barcode: code },
        // Never serve a stale result from the browser cache: the resolution is
        // dynamic (a barcode flips from Candidate to existing Food once saved,
        // and a transient miss must not stick), so each look-up must be fresh.
        cache: 'no-store',
      })
      branch.value =
        result.outcome === 'EXISTING' && result.food
          ? { kind: 'existing', food: result.food }
          : result.candidate
            ? { kind: 'candidate', candidate: result.candidate }
            : { kind: 'manual' }
    } catch {
      // A 404 miss (or an offline lookup) lands on manual entry with the
      // barcode pre-filled — the same place a deliberate manual add starts.
      branch.value = { kind: 'manual' }
    } finally {
      looking.value = false
    }
  }

  return { barcode, looking, branch, lookup }
}

const { barcode, looking, branch, lookup } = useBarcodeLookup()

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

// Release the camera whenever the sheet is dismissed — by the overlay or by the
// parent flipping `open` after a save. The overlay keeps this component mounted
// while closed, so onScopeDispose alone would leave the camera light on.
watch(
  () => props.open,
  (open) => {
    if (!open) stopScan()
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

// Re-key the form so a fresh lookup result reseeds its fields (the form reads
// its `initial` only at mount).
const formKey = computed(() =>
  branch.value.kind === 'candidate'
    ? `candidate:${branch.value.candidate.barcode}`
    : 'manual',
)
</script>

<template>
  <ResponsiveOverlay
    :open="open"
    title="Add food"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="flex flex-col gap-4">
      <!-- Camera scanner: a peer to the manual input, requested only on tap. -->
      <UButton
        v-if="scanState === 'idle' || scanState === 'decoded'"
        block
        icon="i-lucide-scan-barcode"
        color="primary"
        @click="startScan"
      >
        Scan barcode
      </UButton>

      <UButton
        v-else-if="scanState === 'requesting'"
        block
        color="primary"
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

      <p class="text-center text-xs text-muted">or enter a barcode manually</p>

      <form class="flex items-end gap-2" @submit.prevent="lookup">
        <UFormField label="Barcode" name="barcode" class="flex-1">
          <UInput
            v-model="barcode"
            inputmode="numeric"
            placeholder="Type a barcode number"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="subtle"
          :loading="looking"
        >
          Look up
        </UButton>
      </form>

      <UAlert
        v-if="branch.kind === 'existing'"
        icon="i-lucide-check"
        color="success"
        variant="subtle"
        title="Already in your catalog"
        :description="branch.food.name"
      />
      <AddFoodForm
        v-else
        :key="formKey"
        :initial="formInitial"
        :stated-energy-kcal-per100g="statedEnergy"
        @submit="(payload) => emit('submit', payload)"
      />
    </div>
  </ResponsiveOverlay>
</template>
