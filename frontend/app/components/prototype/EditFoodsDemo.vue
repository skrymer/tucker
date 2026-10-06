<script setup lang="ts">
// PROTOTYPE — the /foods list over an in-memory catalog, with the row's tag button
// replaced by Edit. Dev builds only.
import {
  demoCatalog,
  kcalOf,
  recipeKcalPer100g,
  type DemoFood,
} from '~/prototype/editFoodDemo'

const { foods, recipes } = demoCatalog()
const editing = ref<DemoFood | null>(null)

function save(updated: DemoFood) {
  const i = foods.findIndex((f) => f.id === updated.id)
  foods.splice(i, 1, updated)
  editing.value = null
}

const recipeKcal = (r: (typeof recipes)[number]) =>
  recipeKcalPer100g(r, (id) => kcalOf(foods.find((f) => f.id === id)!))
const figures = (kcal: number, protein?: number) =>
  protein == null
    ? `${Math.round(kcal)} kcal /100g`
    : `${Math.round(kcal)} kcal · ${protein} g protein /100g`
</script>

<template>
  <div class="flex flex-col gap-6">
    <ul class="flex flex-col divide-y divide-default">
      <li v-for="food in foods" :key="food.id" class="flex items-center gap-1">
        <div class="min-w-0 flex-1 py-3">
          <p class="truncate font-medium text-default">
            {{ formatName(food.name) }}
          </p>
          <p class="text-sm text-muted">
            {{ figures(kcalOf(food), food.proteinPer100g) }}
          </p>
          <ul v-if="food.tags.length" class="mt-1 flex flex-wrap gap-1">
            <li v-for="tag in food.tags" :key="tag">
              <UBadge :label="tag" color="neutral" variant="soft" size="sm" />
            </li>
          </ul>
        </div>
        <UButton
          :aria-label="`Edit ${formatName(food.name)}`"
          icon="i-lucide-square-pen"
          color="neutral"
          variant="ghost"
          square
          class="size-11 shrink-0 text-muted hover:text-default"
          :ui="{ base: 'justify-center' }"
          @click="editing = food"
        />
        <UButton
          :aria-label="`Delete ${formatName(food.name)}`"
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          square
          disabled
          class="size-11 shrink-0 text-muted"
          :ui="{ base: 'justify-center' }"
        />
      </li>
    </ul>

    <section>
      <h2 class="mb-1 text-sm font-semibold text-muted">
        Recipes (demo — watch these move)
      </h2>
      <ul class="flex flex-col divide-y divide-default text-sm">
        <li
          v-for="r in recipes"
          :key="r.id"
          class="flex justify-between gap-3 py-2"
        >
          <span class="truncate">{{ formatName(r.name) }}</span>
          <span class="shrink-0 text-muted tabular-nums">
            {{ figures(recipeKcal(r)) }}
          </span>
        </li>
      </ul>
    </section>

    <PrototypeEditFoodSheet
      :food="editing"
      :foods="foods"
      :recipes="recipes"
      @close="editing = null"
      @save="save"
    />
  </div>
</template>
