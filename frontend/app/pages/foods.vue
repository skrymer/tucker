<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const { data: foods, refresh } = await useApi('/api/foods')

const open = ref(false)
const selectedFood = ref<FoodResponse | null>(null)
const isDesktop = useIsDesktop()
const { $api } = useNuxtApp()

const { execute: handleSubmit } = useApiMutation(
  (payload: {
    name: string
    proteinPer100g: number
    carbsPer100g: number
    fatPer100g: number
  }) => $api('/api/foods', { method: 'POST', body: payload }),
  {
    // No success toast: the new food appears in the list.
    errorTitle: 'Could not add food',
    onSuccess: () => {
      open.value = false
      return refresh()
    },
  },
)

const { execute: deleteFood } = useApiMutation(
  (food: FoodResponse) =>
    $api('/api/foods/{id}', { method: 'DELETE', path: { id: food.id } }),
  {
    // No success toast: the row disappears from the list.
    errorTitle: 'Could not delete food',
    onSuccess: () => {
      selectedFood.value = null
      return refresh()
    },
  },
)

function handleDeleteConfirm() {
  const food = selectedFood.value
  if (food) deleteFood(food)
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-default">Foods</h1>
      <UButton
        v-if="isDesktop"
        icon="i-lucide-plus"
        color="primary"
        @click="open = true"
      >
        Add food
      </UButton>
    </header>

    <FoodList
      v-if="foods && foods.length > 0"
      :foods="foods"
      @select="selectedFood = $event"
    />
    <FoodEmptyState v-else @add="open = true" />

    <UButton
      v-if="!isDesktop"
      icon="i-lucide-plus"
      color="primary"
      size="xl"
      aria-label="Add food"
      class="fixed right-4 bottom-20 size-14 rounded-full shadow-lg"
      :ui="{ base: 'justify-center' }"
      @click="open = true"
    />

    <AddFoodSheet v-model:open="open" @submit="handleSubmit" />

    <DeleteFoodConfirm
      :food="selectedFood"
      @cancel="selectedFood = null"
      @confirm="handleDeleteConfirm"
    />
  </section>
</template>
