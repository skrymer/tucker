<script setup lang="ts">
import { z } from 'zod'
import type { Ref } from 'vue'
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']
type FoodTag = components['schemas']['FoodTagResponse']

/** One ingredient weighed into the recipe under construction. */
interface DraftIngredient {
  food: FoodResponse
  grams: number
}

const props = defineProps<{
  foods: FoodResponse[]
  pending?: boolean
  /**
   * An existing recipe to edit. When present, the builder opens pre-filled with
   * its name, ingredient lines, and recorded cooked weight — editing is the same
   * builder, seeded (F9 Slice 3). Absent means a blank create.
   */
  initial?: {
    name: string
    cookedWeightG: number
    ingredients: DraftIngredient[]
    tags?: FoodTag[]
  } | null
}>()

const emit = defineEmits<{
  submit: [components['schemas']['CreateRecipeRequest']]
  /** A Food was added to the catalog from "Add a new food". */
  changed: []
}>()

/** The weighed ingredient lines, and their raw total. */
function useIngredientLines() {
  const lines = ref<DraftIngredient[]>([...(props.initial?.ingredients ?? [])])
  const rawSumG = computed(() =>
    lines.value.reduce((sum, line) => sum + line.grams, 0),
  )
  function add(food: FoodResponse, grams: number) {
    lines.value.push({ food, grams })
  }
  function reweigh(index: number, grams: number) {
    const line = lines.value[index]
    if (line) line.grams = grams
  }
  function remove(index: number) {
    lines.value.splice(index, 1)
  }
  return { lines, rawSumG, add, reweigh, remove }
}
const ingredients = useIngredientLines()

/**
 * The cooked weight starts from the raw ingredient total (a tagged estimate) and
 * tracks it until the user replaces it with the finished dish's scale weight.
 * When editing, the recorded cooked weight is a real value, not an estimate, so
 * it starts "edited" and the raw-sum tracker never overwrites it.
 */
function useCookedWeight(rawSumG: Readonly<Ref<number>>) {
  const form = reactive({
    name: props.initial?.name ?? '',
    cookedWeightG: props.initial?.cookedWeightG,
  })
  const edited = ref(!!props.initial)
  watch(rawSumG, (sum) => {
    if (!edited.value) form.cookedWeightG = sum > 0 ? sum : undefined
  })
  // Typing is the signal that the dish was weighed, and it has to be its own
  // one: a number field commits on blur, so the committed value alone can't
  // tell a typed weight from a tab-through — and a dish that loses no water
  // weighs exactly the raw total it was seeded with, so "the value moved" would
  // miss the very case the help text asks for.
  function markEdited() {
    edited.value = true
  }
  // The blur re-emits whatever the field is showing, touched or not. That is
  // not an edit when it leaves the weight where it was — treating it as one
  // would freeze the estimate and roll the recipe up against a stale total.
  function update(value: number | undefined) {
    if (isSameToDisplayedPrecision(value, form.cookedWeightG)) return
    form.cookedWeightG = value
    markEdited()
  }
  return { form, edited, markEdited, update }
}
const {
  form,
  edited: cookedWeightEdited,
  markEdited: markCookedWeightEdited,
  update: updateCookedWeight,
} = useCookedWeight(ingredients.rawSumG)

const tags = ref<FoodTag[]>([...(props.initial?.tags ?? [])])
const creatingTag = ref(false)

/** A Food being weighed: a new line, or the existing one at `index`. */
interface Weighing {
  food: FoodResponse
  grams?: number
  index: number | null
}

/**
 * The add-an-ingredient flow: a step machine inside the one overlay (no nested
 * dialogs, ADR 0017). 'build' is home; 'pick' chooses a Food; 'grams' weighs it.
 */
function useAddIngredientFlow() {
  const step = ref<'build' | 'pick' | 'grams'>('build')
  const weighing = ref<Weighing | null>(null)

  function weigh(next: Weighing) {
    weighing.value = next
    step.value = 'grams'
  }
  function edit(index: number) {
    const line = ingredients.lines.value[index]
    if (line) weigh({ ...line, index })
  }
  function confirm(grams: number) {
    const index = weighing.value?.index ?? null
    if (index === null) ingredients.add(weighing.value!.food, grams)
    else ingredients.reweigh(index, grams)
    step.value = 'build'
  }
  function remove() {
    const index = weighing.value?.index ?? null
    if (index !== null) ingredients.remove(index)
    step.value = 'build'
  }
  // Leaving the grams step: a mis-picked new ingredient returns to the picker;
  // cancelling an edit returns to the build home, leaving the row untouched.
  function backFromGrams() {
    step.value = weighing.value?.index == null ? 'pick' : 'build'
  }
  return { step, weighing, weigh, edit, confirm, remove, backFromGrams }
}
const { step, weighing, weigh, edit, confirm, remove, backFromGrams } =
  useAddIngredientFlow()

// Zod is the single source of truth for the form's required fields and messages
// (ADR 0003). The backend re-validates every guard on save.
const buildSchema = z.object({
  name: z.string().trim().min(1, 'Name your recipe'),
  cookedWeightG: z
    .number({ error: 'Enter the cooked weight' })
    .positive('Cooked weight must be greater than 0'),
})

const rollupLines = computed(() =>
  ingredients.lines.value.map((line) => ({
    caloriesPer100g: line.food.caloriesPer100g,
    proteinPer100g: line.food.proteinPer100g,
    grams: line.grams,
  })),
)

function onSave() {
  const lines = ingredients.lines.value
  if (lines.length === 0 || form.cookedWeightG == null) return
  emit('submit', {
    name: form.name.trim(),
    cookedWeightG: form.cookedWeightG,
    ingredients: lines.map((line) => ({
      foodId: line.food.id,
      grams: line.grams,
    })),
    tagIds: tags.value.map((tag) => tag.id),
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Hidden rather than unmounted while an ingredient is added, so a Tag still
         being created lands in the picker that asked for it. -->
    <UForm
      v-show="step === 'build'"
      :state="form"
      :schema="buildSchema"
      class="flex flex-col gap-4"
      @submit="onSave"
    >
      <UFormField label="Recipe name" name="name" required>
        <UInput
          v-model="form.name"
          placeholder="e.g. Cottage pie"
          class="w-full"
        />
      </UFormField>

      <ul
        v-if="ingredients.lines.value.length > 0"
        role="list"
        class="flex flex-col gap-2"
      >
        <li v-for="(line, index) in ingredients.lines.value" :key="index">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-default px-3 py-2 text-left"
            @click="edit(index)"
          >
            <span class="font-medium text-default">{{
              formatName(line.food.name)
            }}</span>
            <span class="text-sm text-muted">
              {{ line.grams }} g ·
              {{
                Math.round(contribution(line.food.caloriesPer100g, line.grams))
              }}
              kcal
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">Add at least one ingredient.</p>

      <UButton
        icon="i-lucide-plus"
        color="primary"
        variant="subtle"
        block
        @click="step = 'pick'"
      >
        Add ingredient
      </UButton>

      <UFormField
        label="Cooked weight"
        name="cookedWeightG"
        :hint="cookedWeightEdited ? undefined : 'estimated'"
        required
      >
        <NumberField
          :model-value="form.cookedWeightG"
          :min="0"
          :step="10"
          class="w-full"
          @input="markCookedWeightEdited"
          @update:model-value="updateCookedWeight"
        />
        <template #help>
          <span v-if="!cookedWeightEdited">
            Defaults to the raw ingredient total — weigh the finished dish and
            enter its real scale weight.
          </span>
        </template>
      </UFormField>

      <RecipeRollup
        :lines="rollupLines"
        :cooked-weight-g="form.cookedWeightG"
      />

      <UFormField label="Tags">
        <TagPicker v-model="tags" v-model:creating="creatingTag" />
      </UFormField>

      <UButton
        type="submit"
        color="primary"
        block
        :disabled="ingredients.lines.value.length === 0 || creatingTag"
        :loading="pending"
      >
        {{ initial ? 'Save changes' : 'Save recipe' }}
      </UButton>
    </UForm>

    <IngredientPicker
      v-if="step === 'pick'"
      :foods="foods"
      @back="step = 'build'"
      @choose="(food) => weigh({ food, index: null })"
      @changed="emit('changed')"
    />

    <IngredientGramsForm
      v-else-if="step === 'grams' && weighing"
      :food="weighing.food"
      :grams="weighing.grams"
      :editing="weighing.index !== null"
      @back="backFromGrams"
      @confirm="confirm"
      @remove="remove"
    />
  </div>
</template>
