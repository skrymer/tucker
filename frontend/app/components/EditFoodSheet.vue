<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

/**
 * The Food being corrected — non-null opens the sheet. `tracksCalories` gates its
 * Reference Food match, read from the setting rather than from whether a match
 * happens to be set (ADR 0027).
 */
// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
const props = defineProps<{
  food: components['schemas']['FoodResponse'] | null
  tracksCalories?: boolean
}>()
// Stryker restore all
const emit = defineEmits<{ close: [] }>()

/**
 * Run [seed] with each Food the sheet opens on: one sheet is handed Food after
 * Food, so each opening starts from that Food, never from the last one's edits.
 * Keyed on the id, so a re-read of the same Food leaves the edits standing.
 */
function onEachFood(
  seed: (food: components['schemas']['FoodResponse']) => void,
) {
  watch(
    () => props.food?.id,
    () => props.food && seed(props.food),
    { immediate: true },
  )
}

/** The correction as Save sends it: the fields as committed, and the Tags. */
function useCorrectionDraft() {
  const draft = reactive({
    name: '',
    proteinPer100g: undefined as number | undefined,
    carbsPer100g: undefined as number | undefined,
    fatPer100g: undefined as number | undefined,
    fibrePer100g: undefined as number | undefined,
    alcoholAbv: undefined as number | undefined,
  })
  const tags = ref<components['schemas']['FoodTagResponse'][]>([])
  onEachFood((food) => {
    draft.name = food.name
    for (const figure of FOOD_FIGURES) draft[figure] = food[figure] ?? undefined
    tags.value = [...food.tags]
  })
  return { draft, tags }
}
const { draft, tags } = useCorrectionDraft()
const creatingTag = ref(false)
/** Save waits until the sheet has shown which Recipes a correction reaches (ADR 0037). */
const recipesKnown = ref(false)

/**
 * A figure with no value: an empty macro is no figure, leaving the figures
 * incomplete, while an empty optional figure is not stated and counts for nothing.
 */
function blankOf(figure: FoodFigure) {
  return isOptionalFigure(figure) ? undefined : Number.NaN
}

/**
 * Each figure as typed, for the preview: a number field commits its value only on
 * blur, so these follow the field's own keystrokes.
 */
function useTypedMacros() {
  const typed = reactive<TypedMacros>({
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 0,
  })
  /**
   * Holds [value], or the figure's blank where it is no number yet (a lone
   * decimal point): a macro is never left undefined.
   */
  function set(figure: FoodFigure, value: number | undefined) {
    ;(typed as Record<FoodFigure, number | undefined>)[figure] =
      Number.isFinite(value) ? value : blankOf(figure)
  }
  onEachFood((food) => {
    for (const figure of FOOD_FIGURES) set(figure, food[figure] ?? undefined)
  })
  function onType(figure: FoodFigure, event: Event) {
    // The field groups thousands as it formats ("1,000").
    const text = (event.target as HTMLInputElement).value.replace(/,/g, '')
    set(figure, text.trim() === '' ? undefined : Number(text))
  }
  return { typed, set, onType }
}
const { typed, set: setTyped, onType } = useTypedMacros()

/** A committed figure — typed and left, or stepped with its buttons, which type nothing. */
function commit(figure: FoodFigure, value: number | undefined) {
  draft[figure] = value
  setTyped(figure, value)
}

/** The Food's own figures, before and with its macros as typed. */
function useLiveFigures() {
  const complete = computed(() =>
    MACROS.every((macro) => Number.isFinite(typed[macro])),
  )
  const before = computed(() => ({
    kcal: props.food?.caloriesPer100g ?? 0,
    protein: props.food?.proteinPer100g ?? 0,
  }))
  const after = computed(() => ({
    kcal: previewCalories(typed),
    protein: typed.proteinPer100g,
  }))
  const macrosMoved = computed(
    () =>
      complete.value &&
      FOOD_FIGURES.some(
        (figure) => (typed[figure] ?? null) !== (props.food?.[figure] ?? null),
      ),
  )
  return { complete, before, after, macrosMoved }
}
const { complete, before, after, macrosMoved } = useLiveFigures()

function correctionOf(): components['schemas']['CorrectFoodRequest'] {
  return {
    name: draft.name,
    proteinPer100g: draft.proteinPer100g!,
    carbsPer100g: draft.carbsPer100g!,
    fatPer100g: draft.fatPer100g!,
    fibrePer100g: draft.fibrePer100g,
    alcoholAbv: draft.alcoholAbv,
    tagIds: tags.value.map((tag) => tag.id),
  }
}

/** Correcting the Food (ADR 0037); the sheet closes once the correction lands. */
function useCorrectionSave() {
  const { $api } = useNuxtApp()
  const { execute, pending: saving } = useApiMutation(
    (correction: {
      id: number
      body: components['schemas']['CorrectFoodRequest']
    }) =>
      $api('/api/foods/{id}', {
        method: 'PUT',
        path: { id: correction.id },
        body: correction.body,
      }),
    {
      // No success toast: the corrected row is the confirmation (ADR 0005).
      errorTitle: 'Could not save changes',
      onSuccess: () => {
        emit('close')
        return refreshFoodCatalog()
      },
    },
  )
  // Read once at the tap and passed as an argument: a Retry replays the failed
  // attempt's correction, not whatever the fields hold by then.
  function save() {
    if (props.food) execute({ id: props.food.id, body: correctionOf() })
  }
  return { save, saving }
}
const { save, saving } = useCorrectionSave()

/**
 * Whether the sheet's body is the match search rather than the form: one modal
 * layer, never a second sheet over this one (ADR 0017).
 */
const picking = ref(false)
onEachFood(() => {
  picking.value = false
})
</script>

<template>
  <ResponsiveOverlay
    :open="food !== null"
    :title="
      food ? `${picking ? 'Match' : 'Edit'} ${formatName(food.name)}` : ''
    "
    @update:open="(value) => !value && emit('close')"
  >
    <template v-if="picking" #leading>
      <SheetBackButton @click="picking = false" />
    </template>
    <ReferenceFoodSearch
      v-if="food && picking"
      :food="food"
      @close="picking = false"
    />
    <UForm
      v-if="food"
      v-show="!picking"
      :state="draft"
      :schema="foodSchema"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField label="Name" name="name" required>
        <UInput v-model="draft.name" class="w-full" />
      </UFormField>

      <MacroFields :values="draft" @type="onType" @commit="commit" />

      <p role="status" class="text-label text-muted tabular-nums">
        <FigureDiff v-if="complete" :before="before" :after="after" />
        <template v-else>— kcal /100g</template>
      </p>

      <RecipesUsingFood
        :key="food.id"
        v-model:settled="recipesKnown"
        :food-id="food.id"
        :correction="macrosMoved ? typed : null"
      />

      <UFormField label="Tags">
        <TagPicker v-model="tags" v-model:creating="creatingTag" />
      </UFormField>

      <FoodMatchRow
        v-if="tracksCalories"
        :food="food"
        @change="picking = true"
      />

      <p v-if="macrosMoved" class="text-label text-dimmed">
        Food you've already logged keeps the figures it was logged with.
      </p>

      <UButton
        type="submit"
        color="primary"
        class="w-full justify-center"
        :disabled="creatingTag || !recipesKnown"
        :loading="saving"
      >
        Save changes
      </UButton>
    </UForm>
  </ResponsiveOverlay>
</template>
