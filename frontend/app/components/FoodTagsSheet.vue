<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type HeldTag = components['schemas']['FoodTagResponse']

/** The Food whose Tags are being set — non-null opens the sheet. */
export interface Taggable {
  id: number
  name: string
  tags?: HeldTag[]
}

// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
const props = defineProps<{ food: Taggable | null }>()
// Stryker restore all
const emit = defineEmits<{ close: []; changed: [] }>()

const draft = ref<HeldTag[]>([])
const creating = ref(false)
// One sheet is reassigned from Food to Food, so everything picked in it belongs
// to the Food it was picked for — the picker is keyed on the Food for the same
// reason.
watch(
  () => props.food,
  (food) => {
    draft.value = [...(food?.tags ?? [])]
  },
  { immediate: true },
)

/** Setting which Tags the Food carries (ADR 0033); the page re-reads on `changed`. */
function useTagSave() {
  const { $api } = useNuxtApp()
  const { execute, pending: saving } = useApiMutation(
    (target: { foodId: number; tagIds: number[] }) =>
      $api('/api/foods/{id}/tags', {
        method: 'PUT',
        path: { id: target.foodId },
        body: { tagIds: target.tagIds },
      }),
    {
      // No success toast: the row's Tags change where the User is looking.
      errorTitle: 'Could not save tags',
      onSuccess: () => emit('changed'),
    },
  )
  // Read once at the tap and passed as an argument: a Retry replays the failed
  // attempt's arguments, not whichever Food the sheet holds by then.
  function save() {
    const target = props.food
    if (target)
      execute({ foodId: target.id, tagIds: draft.value.map((tag) => tag.id) })
  }
  return { save, saving }
}
const { save, saving } = useTagSave()
</script>

<template>
  <ResponsiveOverlay
    :open="food !== null"
    :title="food ? `Tags for ${formatName(food.name)}` : ''"
    @update:open="(value) => !value && emit('close')"
  >
    <div class="flex flex-col gap-4">
      <TagPicker
        v-if="food"
        :key="food.id"
        v-model="draft"
        v-model:creating="creating"
      />
      <UButton
        color="primary"
        class="w-full justify-center"
        :disabled="creating"
        :loading="saving"
        @click="save"
      >
        Save tags
      </UButton>
    </div>
  </ResponsiveOverlay>
</template>
