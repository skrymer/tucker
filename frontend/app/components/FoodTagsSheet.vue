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

const { $api } = useNuxtApp()

const draft = ref<HeldTag[]>([])
const { data: known, load } = useOptionalFetch((signal) =>
  $api('/api/tags', { signal }),
)
const options = computed<HeldTag[]>(() =>
  (known.value ?? []).map(({ id, name }) => ({ id, name })),
)
const searchTerm = ref('')
const refusal = ref<string | null>(null)
// Closed on every pick: a multi-select left open covers Save below it.
const menuOpen = ref(false)
// One sheet is reassigned from Food to Food, so everything typed into it belongs
// to the Food it was typed for.
watch(
  () => props.food,
  (food) => {
    draft.value = [...(food?.tags ?? [])]
    searchTerm.value = ''
    refusal.value = null
    if (food) load()
  },
  { immediate: true },
)

/**
 * A typed name becomes a Tag at once, so the sheet only ever saves ids — and the
 * server, not this sheet, decides whether it names a Tag the User already has.
 */
// The name last sent, so a refused one can be put back to correct.
let lastTyped = ''
const { execute: create, pending: creating } = useApiMutation(
  async (name: string) => {
    refusal.value = null
    lastTyped = name
    // Emptied as it is sent, so a next name can be typed while this one is created.
    searchTerm.value = ''
    menuOpen.value = false
    const typedFor = props.food?.id
    const tag = await $api('/api/tags', { method: 'POST', body: { name } })
    // The sheet may have moved to another Food while the create was in flight.
    if (props.food?.id !== typedFor) return
    if (draft.value.some((held) => held.id === tag.id)) return
    draft.value = [...draft.value, { id: tag.id, name: tag.name }]
  },
  {
    errorTitle: 'Could not add tag',
    // Stated beside the field it is about, and with no Retry: the same name
    // would be refused again.
    onValidationError: (message) => {
      refusal.value = message
      if (!searchTerm.value) searchTerm.value = lastTyped
    },
  },
)
</script>

<template>
  <ResponsiveOverlay
    :open="food !== null"
    :title="food ? `Tags for ${formatName(food.name)}` : ''"
    @update:open="(value) => !value && emit('close')"
  >
    <div class="flex flex-col gap-4">
      <UInputMenu
        v-model="draft"
        v-model:search-term="searchTerm"
        v-model:open="menuOpen"
        :items="options"
        label-key="name"
        by="id"
        multiple
        open-on-click
        create-item
        icon="i-lucide-tag"
        aria-label="Tags"
        class="w-full"
        @create="create"
        @update:model-value="menuOpen = false"
      />
      <p v-if="refusal" role="alert" class="text-sm text-error">
        {{ refusal }}
      </p>
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
