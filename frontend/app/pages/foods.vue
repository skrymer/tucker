<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

const { data: foods, refresh } = await useApi('/api/foods')

const open = ref(false)
const selectedFood = ref<FoodResponse | null>(null)
// The Food whose row was tapped — non-null opens the grams-only log sheet.
const foodToLog = ref<FoodResponse | null>(null)
// The Food just saved through the Add-Food flow. Its presence pivots the sheet
// into the "log it now" continuation (issue #52); cleared whenever the sheet
// closes so the next open starts on a blank add form.
const createdFood = ref<FoodResponse | null>(null)
const isDesktop = useIsDesktop()
const { $api } = useNuxtApp()
const toast = useToast()

watch(open, (isOpen) => {
  if (!isOpen) createdFood.value = null
})

const { execute: handleSubmit } = useApiMutation(
  async (payload: {
    name: string
    barcode?: string
    proteinPer100g: number
    carbsPer100g: number
    fatPer100g: number
  }) => {
    // Capture the created Food (with its id) to offer logging it next.
    createdFood.value = await $api('/api/foods', {
      method: 'POST',
      body: payload,
    })
  },
  {
    // No success toast: the new food appears in the list, and the sheet stays
    // open offering the "log it now" continuation.
    errorTitle: 'Could not add food',
    onSuccess: () => refresh(),
  },
)

// An explicit, user-driven Weighed Entry against today for a Food that
// already exists — a tapped catalog row, a barcode catalog hit, or the
// "log it now" continuation after a save. The user always supplies the grams.
const { pending: logPending, execute: handleLog } = useApiMutation(
  (payload: { foodId: number; grams: number }) =>
    $api('/api/entries/weighed', {
      method: 'POST',
      body: {
        date: localToday(),
        foodId: payload.foodId,
        grams: payload.grams,
      },
    }),
  {
    // The new Entry lives on Today, not here — a toast confirms it landed.
    successTitle: 'Entry logged',
    errorTitle: 'Could not log entry',
    onSuccess: () => {
      open.value = false
      foodToLog.value = null
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
    // A Food with logged Entries can't be deleted (issue #107): the backend
    // rejects with a 400 naming the Food. Surface that message instead of the
    // transient "check your connection" retry toast — retrying never succeeds.
    // Close the confirm and leave the Food in the catalog.
    onValidationError: (message) => {
      selectedFood.value = null
      toast.add({
        title: 'Could not delete food',
        description: message,
        color: 'error',
        // Assertive and dismissible, but no Retry — the rejection is permanent.
        type: 'foreground',
        duration: Infinity,
        close: true,
        progress: false,
      })
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
      @log="foodToLog = $event"
      @delete="selectedFood = $event"
    />
    <FoodEmptyState v-else @add="open = true" />

    <UButton
      v-if="!isDesktop"
      icon="i-lucide-plus"
      color="primary"
      size="xl"
      aria-label="Add food"
      class="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] size-14 rounded-full shadow-lg"
      :ui="{ base: 'justify-center' }"
      @click="open = true"
    />

    <BarcodeScanSheet
      v-model:open="open"
      :created-food="createdFood"
      @submit="handleSubmit"
      @log="handleLog"
    />

    <LogFoodSheet
      :food="foodToLog"
      :pending="logPending"
      @log="handleLog"
      @close="foodToLog = null"
    />

    <DeleteFoodConfirm
      :food="selectedFood"
      @cancel="selectedFood = null"
      @confirm="handleDeleteConfirm"
    />
  </section>
</template>
