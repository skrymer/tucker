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
const props = defineProps<{
  food: Taggable | null
  /** Whether the page's save is in flight (ADR 0007). */
  saving?: boolean
}>()
// Stryker restore all
const emit = defineEmits<{ close: []; save: [tagIds: number[]] }>()

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
        @click="
          emit(
            'save',
            draft.map((tag) => tag.id),
          )
        "
      >
        Save tags
      </UButton>
    </div>
  </ResponsiveOverlay>
</template>
