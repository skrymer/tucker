<script setup lang="ts">
import { z } from 'zod'
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

/** One ingredient weighed into the recipe under construction. */
interface DraftIngredient {
  food: FoodResponse
  grams: number
}

const props = defineProps<{
  foods: FoodResponse[]
  pending?: boolean
  /**
   * A Food the parent has just persisted from this builder's inline "Add a new
   * food". When it arrives, the builder selects it and continues to grams, so a
   * missing ingredient never dead-ends the recipe.
   */
  createdIngredient?: FoodResponse | null
  /**
   * An existing recipe to edit. When present, the builder opens pre-filled with
   * its name, ingredient lines, and recorded cooked weight — editing is the same
   * builder, seeded (F9 Slice 3). Absent means a blank create.
   */
  initial?: {
    name: string
    cookedWeightG: number
    ingredients: DraftIngredient[]
  } | null
}>()

const emit = defineEmits<{
  submit: [
    {
      name: string
      cookedWeightG: number
      ingredients: { foodId: number; grams: number }[]
    },
  ]
  // The page owns the catalog and its mutations (foods.vue); the inline add-food
  // is handed up so the created Food re-enters the catalog via its refresh.
  'create-food': [
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
 * The recipe under construction: its name, weighed ingredients, and cooked
 * weight, plus the live "Per 100 g" rollup. Cooking only moves water, so the
 * batch total is re-expressed per 100 g of the finished dish (CONTEXT.md). The
 * preview is presentation only — the backend rolls up authoritatively on save
 * (ADR 0002).
 */
function useRecipeDraft() {
  const form = reactive({
    name: props.initial?.name ?? '',
    cookedWeightG: props.initial?.cookedWeightG,
  })
  const ingredients = ref<DraftIngredient[]>([
    ...(props.initial?.ingredients ?? []),
  ])
  const rawSumG = computed(() =>
    ingredients.value.reduce((sum, line) => sum + line.grams, 0),
  )

  // Cooked weight starts from the raw ingredient total (a tagged estimate) and
  // tracks it until the user replaces it with the finished dish's scale weight.
  // When editing, the recorded cooked weight is a real value, not an estimate, so
  // it starts "edited" and the raw-sum tracker never overwrites it.
  const cookedWeightEdited = ref(!!props.initial)
  watch(rawSumG, (sum) => {
    if (!cookedWeightEdited.value)
      form.cookedWeightG = sum > 0 ? sum : undefined
  })
  function markCookedWeightEdited() {
    cookedWeightEdited.value = true
  }

  const rollup = computed(() =>
    rollupRecipe(
      ingredients.value.map((line) => ({
        caloriesPer100g: line.food.caloriesPer100g,
        proteinPer100g: line.food.proteinPer100g,
        grams: line.grams,
      })),
      form.cookedWeightG ?? 0,
    ),
  )

  function addIngredient(food: FoodResponse, grams: number) {
    ingredients.value.push({ food, grams })
  }
  function updateIngredient(index: number, grams: number) {
    const line = ingredients.value[index]
    if (line) line.grams = grams
  }
  function removeIngredient(index: number) {
    ingredients.value.splice(index, 1)
  }

  return {
    form,
    ingredients,
    rawSumG,
    cookedWeightEdited,
    markCookedWeightEdited,
    rollup,
    addIngredient,
    updateIngredient,
    removeIngredient,
  }
}

const {
  form,
  ingredients,
  rawSumG,
  cookedWeightEdited,
  markCookedWeightEdited,
  rollup,
  addIngredient,
  updateIngredient,
  removeIngredient,
} = useRecipeDraft()

/**
 * The add-an-ingredient flow: a step machine inside the one overlay (no nested
 * dialogs, ADR 0017). 'build' is home; 'pick' chooses a Food; 'grams' weighs it.
 */
function useAddIngredientFlow() {
  type Step = 'build' | 'pick' | 'grams' | 'newFood'
  const step = ref<Step>('build')
  const pickedFood = ref<FoodResponse | null>(null)
  const gramsState = reactive({ grams: undefined as number | undefined })
  // null while adding a new ingredient; the row's index while editing one.
  const editingIndex = ref<number | null>(null)

  // Only plain Foods can be ingredients — no nested recipes in v1 (CONTEXT.md).
  const pickableFoods = computed(() =>
    props.foods.filter((f) => f.kind === 'FOOD'),
  )

  function start() {
    editingIndex.value = null
    step.value = 'pick'
  }
  function choose(food: FoodResponse) {
    pickedFood.value = food
    gramsState.grams = undefined
    editingIndex.value = null
    step.value = 'grams'
  }
  function edit(index: number) {
    const line = ingredients.value[index]
    if (!line) return
    pickedFood.value = line.food
    gramsState.grams = line.grams
    editingIndex.value = index
    step.value = 'grams'
  }
  function confirm() {
    const food = pickedFood.value
    const grams = gramsState.grams
    if (!food || !grams || grams <= 0) return
    if (editingIndex.value === null) addIngredient(food, grams)
    else updateIngredient(editingIndex.value, grams)
    step.value = 'build'
  }
  function remove() {
    if (editingIndex.value !== null) removeIngredient(editingIndex.value)
    step.value = 'build'
  }
  function back() {
    step.value = 'build'
  }
  function backToPick() {
    step.value = 'pick'
  }
  // Leaving the grams step: a mis-picked new ingredient returns to the picker;
  // cancelling an edit returns to the build home, leaving the row untouched.
  function backFromGrams() {
    step.value = editingIndex.value === null ? 'pick' : 'build'
  }
  function startNewFood() {
    step.value = 'newFood'
  }

  return {
    step,
    pickedFood,
    gramsState,
    editingIndex,
    pickableFoods,
    start,
    choose,
    edit,
    confirm,
    remove,
    back,
    backToPick,
    backFromGrams,
    startNewFood,
  }
}

const {
  step,
  pickedFood,
  gramsState,
  editingIndex,
  pickableFoods,
  start,
  choose,
  edit,
  confirm,
  remove,
  back,
  backToPick,
  backFromGrams,
  startNewFood,
} = useAddIngredientFlow()

// The parent persists an inline-added Food and hands it back; select it and
// continue to grams, so "Add a new food" flows straight back into the recipe.
watch(
  () => props.createdIngredient,
  (food) => {
    if (food) choose(food)
  },
)

// Zod is the single source of truth for the forms' required fields and messages
// (ADR 0003). The backend re-validates every guard on save.
const buildSchema = z.object({
  name: z.string().trim().min(1, 'Name your recipe'),
  cookedWeightG: z
    .number({ error: 'Enter the cooked weight' })
    .positive('Cooked weight must be greater than 0'),
})
const gramsFormSchema = z.object({ grams: gramsSchema })

const gramsPresets = [50, 100, 150, 200]

/** The kcal a row contributes to the batch — grams × per-100g ÷ 100. */
function contributionKcal(caloriesPer100g: number, grams: number): number {
  return (caloriesPer100g * grams) / 100
}

const round = (n: number) => Math.round(n)

// The cook-down bar: the finished dish's weight as a fraction of the raw sum.
// A dish that cooks down reads as a shorter (denser) bar; one that absorbs water
// fills the track.
const cookDownPct = computed(() => {
  const cooked = form.cookedWeightG ?? 0
  if (rawSumG.value <= 0 || cooked <= 0) return 0
  return Math.min(100, (cooked / rawSumG.value) * 100)
})

function onSave() {
  if (ingredients.value.length === 0 || form.cookedWeightG == null) return
  emit('submit', {
    name: form.name.trim(),
    cookedWeightG: form.cookedWeightG,
    ingredients: ingredients.value.map((line) => ({
      foodId: line.food.id,
      grams: line.grams,
    })),
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UForm
      v-if="step === 'build'"
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

      <ul v-if="ingredients.length > 0" role="list" class="flex flex-col gap-2">
        <li v-for="(line, index) in ingredients" :key="index">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-default px-3 py-2 text-left"
            @click="edit(index)"
          >
            <span class="font-medium text-default">{{ line.food.name }}</span>
            <span class="text-sm text-muted">
              {{ line.grams }} g ·
              {{
                round(contributionKcal(line.food.caloriesPer100g, line.grams))
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
        @click="start"
      >
        Add ingredient
      </UButton>

      <UFormField
        label="Cooked weight"
        name="cookedWeightG"
        :hint="cookedWeightEdited ? undefined : 'estimated'"
        required
      >
        <UInputNumber
          v-model="form.cookedWeightG"
          :min="0"
          :step="10"
          class="w-full"
          @update:model-value="markCookedWeightEdited"
        />
        <template #help>
          <span v-if="!cookedWeightEdited">
            Defaults to the raw ingredient total — weigh the finished dish and
            enter its real scale weight.
          </span>
        </template>
      </UFormField>

      <section
        aria-label="Per 100 g"
        class="flex flex-col gap-2 rounded-xl bg-elevated/50 p-4"
      >
        <p class="text-sm font-medium text-muted">Per 100 g</p>
        <div class="flex items-baseline gap-4">
          <p class="text-2xl font-bold text-primary">
            {{ round(rollup.per100gKcal) }} kcal
          </p>
          <p class="text-lg font-semibold text-secondary">
            {{ round(rollup.per100gProtein) }} g protein
          </p>
        </div>
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs text-muted">
            <span>{{ round(rawSumG) }} g raw</span>
            <span>{{ round(form.cookedWeightG ?? 0) }} g cooked</span>
          </div>
          <div
            class="h-2 overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <div
              class="h-full rounded-full bg-primary/60 transition-[width]"
              :style="{ width: cookDownPct + '%' }"
            />
          </div>
        </div>
      </section>

      <UButton
        type="submit"
        color="primary"
        block
        :disabled="ingredients.length === 0"
        :loading="pending"
      >
        {{ initial ? 'Save changes' : 'Save recipe' }}
      </UButton>
    </UForm>

    <div v-else-if="step === 'pick'" class="flex flex-col gap-3">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        class="self-start"
        @click="back"
      >
        Back
      </UButton>
      <UButton
        icon="i-lucide-plus"
        color="primary"
        variant="subtle"
        block
        @click="startNewFood"
      >
        Add a new food
      </UButton>

      <ul role="list" class="flex flex-col gap-2">
        <li v-for="food in pickableFoods" :key="food.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-default px-3 py-2 text-left"
            @click="choose(food)"
          >
            <span class="font-medium text-default">{{ food.name }}</span>
            <span class="text-sm text-muted">
              {{ round(food.caloriesPer100g) }} kcal /100g
            </span>
          </button>
        </li>
      </ul>
    </div>

    <div v-else-if="step === 'newFood'" class="flex flex-col gap-3">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        class="self-start"
        @click="backToPick"
      >
        Back
      </UButton>
      <AddFoodForm @submit="(payload) => emit('create-food', payload)" />
    </div>

    <UForm
      v-else-if="step === 'grams'"
      :state="gramsState"
      :schema="gramsFormSchema"
      class="flex flex-col gap-4"
      @submit="confirm"
    >
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        type="button"
        class="self-start"
        @click="backFromGrams"
      >
        Back
      </UButton>
      <p class="font-medium text-default">{{ pickedFood?.name }}</p>

      <UFormField label="Grams" name="grams" required>
        <UInputNumber
          v-model="gramsState.grams"
          :min="0"
          :step="1"
          class="w-full"
        />
      </UFormField>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="preset in gramsPresets"
          :key="preset"
          type="button"
          size="sm"
          color="neutral"
          variant="subtle"
          @click="gramsState.grams = preset"
        >
          {{ preset }} g
        </UButton>
      </div>

      <p v-if="pickedFood && gramsState.grams" class="text-sm text-muted">
        Adds
        {{
          round(contributionKcal(pickedFood.caloriesPer100g, gramsState.grams))
        }}
        kcal
      </p>

      <UButton v-if="editingIndex === null" type="submit" color="primary" block>
        Add
      </UButton>
      <template v-else>
        <UButton type="submit" color="primary" block>Update</UButton>
        <UButton
          type="button"
          color="error"
          variant="ghost"
          block
          @click="remove"
        >
          Remove
        </UButton>
      </template>
    </UForm>
  </div>
</template>
