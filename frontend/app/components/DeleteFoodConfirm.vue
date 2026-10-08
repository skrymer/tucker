<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

// Stryker disable next-line all: a compiler macro must stay a top-level statement
const props = defineProps<{ food: FoodResponse | null }>()

const emit = defineEmits<{
  changed: []
  cancel: []
}>()

/** Deleting the Food; the page re-reads its catalog on `changed`. */
function useFoodDeletion() {
  const { $api } = useNuxtApp()
  const toast = useToast()
  const { execute } = useApiMutation(
    (food: FoodResponse) =>
      $api('/api/foods/{id}', { method: 'DELETE', path: { id: food.id } }),
    {
      // No success toast: the row disappears from the list.
      errorTitle: 'Could not delete food',
      onSuccess: () => emit('changed'),
      // A Food with logged Entries can't be deleted: the backend refuses with a
      // 400 naming the Food. State that rather than the transient "check your
      // connection" retry toast — retrying never succeeds — and close.
      onValidationError: (message) => {
        emit('cancel')
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
  return () => props.food && execute(props.food)
}
const deleteFood = useFoodDeletion()
</script>

<template>
  <UModal
    :open="food !== null"
    title="Delete this food?"
    @update:open="(value) => !value && emit('cancel')"
  >
    <template #body>
      <p class="text-sm text-default">
        <span class="font-medium">{{ formatName(food?.name ?? '') }}</span> will
        be removed from your catalog. A food you've logged entries against, or
        used as a recipe ingredient, can't be deleted — your entries and recipes
        depend on it.
      </p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="emit('cancel')">Cancel</UButton>
        <UButton color="error" @click="deleteFood">Delete</UButton>
      </div>
    </template>
  </UModal>
</template>
