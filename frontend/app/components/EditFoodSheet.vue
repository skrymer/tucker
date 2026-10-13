<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

/** The Food being corrected — non-null opens the sheet. */
// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
const props = defineProps<{
  food: components['schemas']['FoodResponse'] | null
}>()
// Stryker restore all
const emit = defineEmits<{ close: [] }>()

/**
 * Run [seed] with each Food the sheet opens on: one sheet is handed Food after
 * Food, so each opening starts from that Food, never from the last one's edits.
 */
function onEachFood(
  seed: (food: components['schemas']['FoodResponse']) => void,
) {
  watch(
    () => props.food,
    (food) => food && seed(food),
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
  })
  const tags = ref<components['schemas']['FoodTagResponse'][]>([])
  onEachFood((food) => {
    draft.name = food.name
    for (const macro of MACROS) draft[macro] = food[macro] ?? undefined
    tags.value = [...food.tags]
  })
  return { draft, tags }
}
const { draft, tags } = useCorrectionDraft()
const creatingTag = ref(false)

/**
 * Each macro as typed, for the preview: a number field commits its value only on
 * blur, so these follow the field's own keystrokes. An empty field is no figure.
 */
function useTypedMacros() {
  const typed = reactive<Record<Macro, number>>({
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 0,
  })
  onEachFood((food) => {
    for (const macro of MACROS) typed[macro] = food[macro] ?? Number.NaN
  })
  function onType(macro: Macro, event: Event) {
    // The field groups thousands as it formats ("1,000").
    const text = (event.target as HTMLInputElement).value.replace(/,/g, '')
    typed[macro] = text.trim() === '' ? Number.NaN : Number(text)
  }
  return { typed, onType }
}
const { typed, onType } = useTypedMacros()

/** A committed macro — typed and left, or stepped with its buttons, which type nothing. */
function commit(macro: Macro, value: number | undefined) {
  draft[macro] = value
  typed[macro] = value ?? Number.NaN
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
      MACROS.some((macro) => typed[macro] !== (props.food?.[macro] ?? 0)),
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
</script>

<template>
  <ResponsiveOverlay
    :open="food !== null"
    :title="food ? `Edit ${formatName(food.name)}` : ''"
    @update:open="(value) => !value && emit('close')"
  >
    <UForm
      v-if="food"
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

      <UFormField label="Tags">
        <TagPicker v-model="tags" v-model:creating="creatingTag" />
      </UFormField>

      <p v-if="macrosMoved" class="text-label text-dimmed">
        Food you've already logged keeps the figures it was logged with.
      </p>

      <UButton
        type="submit"
        color="primary"
        class="w-full justify-center"
        :disabled="creatingTag"
        :loading="saving"
      >
        Save changes
      </UButton>
    </UForm>
  </ResponsiveOverlay>
</template>
