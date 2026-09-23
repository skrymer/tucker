<script setup lang="ts">
/** A Tag as the sheet holds it: enough to show a chip and send the id back. */
export interface HeldTag {
  id: number
  name: string
}

/** The Food whose Tags are being set — non-null opens the sheet. */
export interface Taggable {
  id: number
  name: string
  tags?: HeldTag[]
}

// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
const props = defineProps<{ food: Taggable | null }>()
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
watch(
  () => props.food,
  (food) => {
    draft.value = [...(food?.tags ?? [])]
    if (food) load()
  },
  { immediate: true },
)

/**
 * A typed name becomes a Tag at once, so the sheet only ever saves ids — and the
 * server, not this sheet, decides whether it names a Tag the User already has.
 */
const searchTerm = ref('')
const refusal = ref<string | null>(null)
const { execute: create } = useApiMutation(
  async (name: string) => {
    refusal.value = null
    const tag = await $api('/api/tags', { method: 'POST', body: { name } })
    searchTerm.value = ''
    if (draft.value.some((held) => held.id === tag.id)) return
    draft.value = [...draft.value, { id: tag.id, name: tag.name }]
  },
  {
    errorTitle: 'Could not add tag',
    // Stated beside the field it is about, and with no Retry: the same name
    // would be refused again.
    onValidationError: (message) => {
      refusal.value = message
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
      />
      <p v-if="refusal" role="alert" class="text-sm text-error">
        {{ refusal }}
      </p>
      <UButton
        color="primary"
        class="w-full justify-center"
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
