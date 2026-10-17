<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

// Stryker disable next-line all: a compiler macro must stay a top-level statement
const props = defineProps<{ food: FoodResponse | null }>()

const emit = defineEmits<{ close: [] }>()

/** The toast stating why the backend refused the delete. */
function refusal(message: string) {
  return {
    title: 'Could not delete food',
    description: message,
    color: 'error' as const,
    // Assertive and dismissible, but no Retry — the rejection is permanent.
    type: 'foreground' as const,
    duration: Infinity,
    close: true,
    progress: false,
  }
}

/**
 * The Food a delete was last sent for, and a close that happens only while the
 * confirm still asks about it: a late Retry of a failed delete can land after
 * the confirm has moved on to another Food.
 */
function useDeletingFood() {
  let deleting: FoodResponse | null = null
  return {
    sending: (food: FoodResponse) => (deleting = food),
    closeIfStillAsked: () => {
      if (props.food?.id === deleting?.id) emit('close')
    },
  }
}

/** Deleting the Food; the confirm closes once it is gone, or refused. */
function useFoodDeletion() {
  const { $api } = useNuxtApp()
  const toast = useToast()
  const { sending, closeIfStillAsked } = useDeletingFood()
  const { pending, execute } = useApiMutation(
    (food: FoodResponse) => {
      sending(food)
      return $api('/api/foods/{id}', {
        method: 'DELETE',
        path: { id: food.id },
      })
    },
    {
      // No success toast: the row disappears from the list.
      errorTitle: 'Could not delete food',
      onSuccess: () => {
        closeIfStillAsked()
        return refreshFoodCatalog()
      },
      // A Food with logged Entries can't be deleted: the backend refuses with a
      // 400 naming the Food. State that rather than the transient "check your
      // connection" retry toast — retrying never succeeds — and close.
      onValidationError: (message) => {
        closeIfStillAsked()
        toast.add(refusal(message))
      },
    },
  )
  return {
    pending,
    confirm: () => props.food && execute(props.food),
  }
}
const deletion = useFoodDeletion()
</script>

<template>
  <ConfirmDeleteDialog
    :open="food !== null"
    title="Delete this food?"
    :pending="deletion.pending.value"
    @cancel="emit('close')"
    @confirm="deletion.confirm"
  >
    <span class="font-medium">{{ formatName(food?.name ?? '') }}</span> will be
    removed from your catalog. A food you've logged entries against, or used as
    a recipe ingredient, can't be deleted — your entries and recipes depend on
    it.
  </ConfirmDeleteDialog>
</template>
