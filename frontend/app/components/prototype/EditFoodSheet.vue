<script setup lang="ts">
// PROTOTYPE — one sheet to correct a Food's name, macros and tags, with the
// Recipes the correction re-rolls listed (collapsed) under the macros. Dev only.
import { z } from 'zod'
import PrototypeFigureDiff from './FigureDiff.vue'
import {
  kcalOf,
  recipeKcalPer100g as recipePer100g,
  type DemoFood,
  type DemoRecipe,
} from '~/prototype/editFoodDemo'

const props = defineProps<{
  food: DemoFood | null
  foods: DemoFood[]
  recipes: DemoRecipe[]
}>()
const emit = defineEmits<{ close: []; save: [DemoFood] }>()

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name for this food'),
  proteinPer100g: z.number({ error: 'Enter protein per 100 g' }),
  carbsPer100g: z.number({ error: 'Enter carbs per 100 g' }),
  fatPer100g: z.number({ error: 'Enter fat per 100 g' }),
})

type Macro = 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'

const expanded = ref(false)
const draft = reactive<DemoFood>({
  id: 0,
  name: '',
  proteinPer100g: 0,
  carbsPer100g: 0,
  fatPer100g: 0,
  tags: [],
})
// What the fields show *as typed*: a number field commits its v-model only on
// blur, so the preview reads the keystrokes instead.
const live = reactive<Record<Macro, number>>({
  proteinPer100g: 0,
  carbsPer100g: 0,
  fatPer100g: 0,
})
watch(
  () => props.food,
  (food) => {
    if (food) {
      Object.assign(draft, { ...food, tags: [...food.tags] })
      live.proteinPer100g = food.proteinPer100g
      live.carbsPer100g = food.carbsPer100g
      live.fatPer100g = food.fatPer100g
    }
    expanded.value = false
  },
  { immediate: true },
)

function onType(field: Macro, event: Event) {
  const text = (event.target as HTMLInputElement).value.replace(/,/g, '')
  live[field] = text.trim() === '' ? Number.NaN : Number(text)
}
function onCommit(field: Macro, value: number | undefined) {
  draft[field] = value as number
  live[field] = value ?? Number.NaN
}

const liveComplete = computed(
  () =>
    Number.isFinite(live.proteinPer100g) &&
    Number.isFinite(live.carbsPer100g) &&
    Number.isFinite(live.fatPer100g),
)

const macrosChanged = computed(
  () =>
    !!props.food &&
    liveComplete.value &&
    (live.proteinPer100g !== props.food.proteinPer100g ||
      live.carbsPer100g !== props.food.carbsPer100g ||
      live.fatPer100g !== props.food.fatPer100g),
)

const usedIn = computed(() =>
  props.food
    ? props.recipes
        .filter((r) => r.ingredients.some((l) => l.foodId === props.food!.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [],
)

interface Figures {
  kcal: number
  protein: number
}

function foodFigures(id: number, useLive: boolean): Figures {
  const f =
    useLive && id === props.food?.id
      ? live
      : props.foods.find((x) => x.id === id)!
  return { kcal: kcalOf(f), protein: f.proteinPer100g }
}

function recipeFigures(r: DemoRecipe, useLive: boolean): Figures {
  return {
    kcal: recipePer100g(r, (id) => foodFigures(id, useLive).kcal),
    protein: recipePer100g(r, (id) => foodFigures(id, useLive).protein),
  }
}

const own = computed(() =>
  props.food
    ? {
        before: foodFigures(props.food.id, false),
        after: liveComplete.value ? foodFigures(props.food.id, true) : null,
      }
    : null,
)

/** Each affected recipe's figures now, and with the fields as typed. */
const impact = computed(() =>
  usedIn.value.map((r) => ({
    recipe: r,
    before: recipeFigures(r, false),
    after: liveComplete.value ? recipeFigures(r, true) : null,
  })),
)

const recipeNoun = (n: number) => (n === 1 ? 'recipe' : 'recipes')

function onSubmit() {
  emit('save', {
    ...draft,
    name: draft.name.trim(),
    tags: [...draft.tags],
  })
}
</script>

<template>
  <ResponsiveOverlay
    :open="food !== null"
    :title="food ? `Edit ${formatName(food.name)}` : ''"
    @update:open="(value) => !value && emit('close')"
  >
    <UForm
      v-if="food && own"
      :state="draft"
      :schema="schema"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UFormField label="Name" name="name" required>
        <UInput v-model="draft.name" class="w-full" />
      </UFormField>

      <div class="flex flex-col gap-2">
        <div class="grid grid-cols-3 gap-3">
          <UFormField label="Protein /100g" name="proteinPer100g" required>
            <NumberField
              :model-value="draft.proteinPer100g"
              :min="0"
              :step="0.1"
              class="w-full"
              @input="onType('proteinPer100g', $event)"
              @update:model-value="onCommit('proteinPer100g', $event)"
            />
          </UFormField>
          <UFormField label="Carbs /100g" name="carbsPer100g" required>
            <NumberField
              :model-value="draft.carbsPer100g"
              :min="0"
              :step="0.1"
              class="w-full"
              @input="onType('carbsPer100g', $event)"
              @update:model-value="onCommit('carbsPer100g', $event)"
            />
          </UFormField>
          <UFormField label="Fat /100g" name="fatPer100g" required>
            <NumberField
              :model-value="draft.fatPer100g"
              :min="0"
              :step="0.1"
              class="w-full"
              @input="onType('fatPer100g', $event)"
              @update:model-value="onCommit('fatPer100g', $event)"
            />
          </UFormField>
        </div>

        <!-- The Food's own figures, in the same diff idiom as its recipes below:
             a figure that moved is struck through, dimmed, before the new one. -->
        <p class="text-sm text-muted tabular-nums" aria-live="polite">
          <template v-if="own.after">
            <PrototypeFigureDiff :before="own.before" :after="own.after" />
          </template>
          <template v-else>— kcal /100g</template>
        </p>

        <!-- What the correction reaches, right under the figures that cause it.
             Collapsed: the count is the news, the list is there on request. -->
        <section
          v-if="usedIn.length"
          aria-labelledby="proto-used-in"
          class="mt-1 rounded-xl border border-default"
        >
          <button
            id="proto-used-in"
            type="button"
            class="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-default focus-visible:outline-2 focus-visible:outline-primary"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
          >
            <UIcon
              name="i-lucide-cooking-pot"
              class="size-4 shrink-0 text-primary"
            />
            <span v-if="macrosChanged">
              Also updates {{ usedIn.length }} {{ recipeNoun(usedIn.length) }}
            </span>
            <span v-else>
              Used in {{ usedIn.length }} {{ recipeNoun(usedIn.length) }}
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="ms-auto size-4 text-muted transition-transform motion-reduce:transition-none"
              :class="expanded && 'rotate-180'"
            />
          </button>
          <ul
            v-if="expanded"
            class="max-h-48 divide-y divide-default overflow-y-auto border-t border-default px-3"
          >
            <li v-for="row in impact" :key="row.recipe.id" class="py-2">
              <!-- FigureRow's shape, hand-rolled: its figures are a string, and a
                   diff needs markup. A real build would give it a figures slot. -->
              <span class="block min-w-0">
                <span class="block truncate font-medium text-default">
                  {{ formatName(row.recipe.name) }}
                </span>
                <span class="block text-sm text-muted tabular-nums">
                  <PrototypeFigureDiff
                    v-if="row.after && macrosChanged"
                    :before="row.before"
                    :after="row.after"
                  />
                  <template v-else>
                    {{
                      formatPer100g({
                        caloriesPer100g: row.before.kcal,
                        proteinPer100g: row.before.protein,
                      })
                    }}
                  </template>
                </span>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <UFormField label="Tags">
        <UInputTags
          v-model="draft.tags"
          placeholder="Add a tag"
          class="w-full"
        />
      </UFormField>

      <p v-if="macrosChanged" class="text-xs text-dimmed">
        Food you've already logged keeps the figures it was logged with.
      </p>

      <UButton type="submit" color="primary" class="w-full justify-center">
        Save changes
      </UButton>
    </UForm>
  </ResponsiveOverlay>
</template>
