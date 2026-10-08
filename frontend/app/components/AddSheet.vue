<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'

type Food = components['schemas']['FoodResponse']
type NewFood = components['schemas']['CreateFoodRequest']

const props = defineProps<{
  open: boolean
  /** The catalog, for the recipe builder's ingredient picker (recipes excluded). */
  foods?: Food[]
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  /** A Food was added to the catalog. */
  changed: []
}>()

// The overlay hosts two builders (CONTEXT.md): a plain Food (with its barcode
// pre-fill) or a composite Recipe. Food leads by default.
const mode = ref<'food' | 'recipe'>('food')
const modeItems: TabsItem[] = [
  { value: 'food', label: 'Food', slot: 'food' },
  { value: 'recipe', label: 'Recipe', slot: 'recipe' },
]

// A barcode this User already has a Food for answers the whole flow: the Food
// itself is the answer, and there is nothing to add.
const existingFood = ref<Food | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    // Everything else starts clean on the way *in*, not on the way out: the
    // overlay holds this component through its exit animation, so a reset on
    // close is watched — the header retitles and a blank Food form slides out in
    // place of whatever the User just saved.
    //
    // A stale catalog hit or candidate must not resurface; the form is remounted
    // so typed and merged values don't linger across opens (within one open it
    // stays mounted, see formSession); and the mode is a per-session choice.
    existingFood.value = null
    formSession.value++
    mode.value = 'food'
  },
)

// Re-key the form per open, not per lookup result: within one open the form is
// never remounted, so a resolving look-up merges into it (ADR 0007) instead of
// wiping what the user has typed; reopening the sheet starts a fresh form.
const formSession = ref(0)

/**
 * A catalog save, closing the sheet on the opening it was issued from — and
 * only that one: a save resolves whenever it resolves, and on a slow connection
 * that can be after the User gave up on it, dismissed the sheet and opened a
 * fresh one. Closing *that* would take a half-typed Recipe with it.
 *
 * The sheet closing is the confirmation, as the vanishing row is for a delete
 * (ADR 0005) — it closes on success alone, a failure leaving it open under a
 * Retry toast. The page re-reads its catalog on `changed`, because the
 * catalog's order is the server's.
 */
function useCatalogSave() {
  const { $api } = useNuxtApp()
  async function fromThisOpening<T>(save: Promise<T>): Promise<T> {
    const issuedIn = formSession.value
    const saved = await save
    emit('changed')
    if (props.open && formSession.value === issuedIn) emit('update:open', false)
    return saved
  }
  const { execute: saveFood } = useApiMutation(
    (payload: NewFood) =>
      fromThisOpening($api('/api/foods', { method: 'POST', body: payload })),
    { errorTitle: 'Could not add food' },
  )
  // A Recipe is a composite Food (kind = RECIPE); the backend rolls up its
  // nutrition, so it joins the catalog exactly like a plain Food.
  const { execute: saveRecipe, pending: recipePending } = useApiMutation(
    (payload: components['schemas']['CreateRecipeRequest']) =>
      fromThisOpening($api('/api/recipes', { method: 'POST', body: payload })),
    { errorTitle: 'Could not add recipe' },
  )
  return { saveFood, saveRecipe, recipePending }
}
const { saveFood, saveRecipe, recipePending } = useCatalogSave()
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
          <FoodBuilder
            :key="formSession"
            :open="open"
            :in-view="mode === 'food'"
            class="mt-4"
            @submit="saveFood"
            @found="existingFood = $event"
          />
        </template>

        <template #recipe>
          <RecipeBuilder
            :key="formSession"
            :foods="foods ?? []"
            :pending="recipePending"
            class="mt-4"
            @submit="saveRecipe"
            @changed="emit('changed')"
          />
        </template>
      </UTabs>
    </div>
  </ResponsiveOverlay>
</template>
