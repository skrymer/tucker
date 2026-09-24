<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type HeldTag = components['schemas']['FoodTagResponse']

// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
/** The Tags picked so far. */
const picked = defineModel<HeldTag[]>({ required: true })
/** True while a typed name is being created, so a Save beside it can wait for its id. */
const creating = defineModel<boolean>('creating', { default: false })
// Stryker restore all

const { $api } = useNuxtApp()

/** Every Tag the User keeps, offered in the server's order. */
function useTagOptions() {
  const { data: known, load } = useOptionalFetch((signal) =>
    $api('/api/tags', { signal }),
  )
  load()
  return computed<HeldTag[]>(() =>
    (known.value ?? []).map(({ id, name }) => ({ id, name })),
  )
}

/**
 * Picking from the list, and typing a name. A typed name becomes a Tag at once, so
 * the picker only ever holds ids — and the server, not this picker, decides whether
 * it names a Tag the User already has.
 */
function useTagEntry() {
  const searchTerm = ref('')
  const refusal = ref<string | null>(null)
  // Closed on every pick: a multi-select left open covers what sits below it.
  const menuOpen = ref(false)
  // The name last sent, so a refused one can be put back to correct.
  let lastTyped = ''

  const { execute: create, pending } = useApiMutation(
    async (name: string) => {
      refusal.value = null
      lastTyped = name
      // Emptied as it is sent, so a next name can be typed while this one is created.
      searchTerm.value = ''
      menuOpen.value = false
      // A picker gone by the time this lands cannot emit, so the Tag never reaches
      // whatever replaced it — which is why a consumer keys it on what it is picking for.
      const tag = await $api('/api/tags', { method: 'POST', body: { name } })
      if (picked.value.some((held) => held.id === tag.id)) return
      picked.value = [...picked.value, { id: tag.id, name: tag.name }]
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
  watch(pending, (value) => (creating.value = value), { immediate: true })

  /**
   * A pick from the list, or a name entered with the list closed — which the tags
   * input hands over as a bare string. That string is sent to be created like any
   * typed name, never held as a chip with no Tag behind it.
   */
  function pick(value: (HeldTag | string)[]) {
    menuOpen.value = false
    picked.value = value.filter(
      (item): item is HeldTag => typeof item !== 'string',
    )
    value
      .filter((item) => typeof item === 'string')
      .forEach((name) => create(name))
  }

  return { searchTerm, refusal, menuOpen, create, pick }
}

const options = useTagOptions()
const { searchTerm, refusal, menuOpen, create, pick } = useTagEntry()
</script>

<template>
  <!-- Enter here names a Tag; it never submits a form the picker sits in. -->
  <div class="flex flex-col gap-2" @keydown.enter.prevent>
    <UInputMenu
      v-model:search-term="searchTerm"
      v-model:open="menuOpen"
      :model-value="picked"
      :content="{ side: 'top' }"
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
      @update:model-value="pick"
    />
    <p v-if="refusal" role="alert" class="text-sm text-error">
      {{ refusal }}
    </p>
  </div>
</template>
