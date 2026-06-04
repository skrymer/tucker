<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type Candidate = components['schemas']['FoodCandidateResponse']
type Food = components['schemas']['FoodResponse']

defineProps<{ open: boolean }>()

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
 * The barcode-lookup half of the Add-Food flow (ADR 0006). Resolves a typed
 * barcode through the backend and branches: a provider Candidate pre-fills the
 * form, an existing Food is surfaced, a miss (or offline) drops to manual entry
 * with the barcode pre-filled. Manual entry is an always-on peer, never gated.
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
