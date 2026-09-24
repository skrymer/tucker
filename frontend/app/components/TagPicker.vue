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
  // Names wait their turn rather than being dropped while one is created; the
  // head is the one in flight, and stays until it lands.
  const queued = ref<string[]>([])
  watchEffect(() => (creating.value = queued.value.length > 0))

  const { execute: create } = useApiMutation(
    async (name: string) => {
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
        // Put back to be corrected: the refused name is still the queue's head.
        if (!searchTerm.value) searchTerm.value = queued.value[0] ?? ''
      },
    },
  )

  async function enter(name: string) {
    refusal.value = null
    // Emptied as it is sent, so a next name can be typed while this one is created.
    searchTerm.value = ''
    menuOpen.value = false
    queued.value.push(name)
    if (queued.value.length > 1) return
    while (queued.value.length) {
      await create(queued.value[0]!)
      queued.value.shift()
    }
  }

  /**
   * A name entered with the list closed. Taken in the capture phase, because the
   * tags input would otherwise draw it as a chip with no Tag behind it.
   */
  function enterTyped() {
    if (!menuOpen.value && searchTerm.value.trim()) enter(searchTerm.value)
  }

  /** A pick from the list. */
  function pick(held: HeldTag[]) {
    menuOpen.value = false
    // A name typed and entered is a request to hold that Tag, never to drop one.
    const kept = searchTerm.value
      ? picked.value
      : picked.value.filter((tag) => held.some(({ id }) => id === tag.id))
    picked.value = [
      ...kept,
      ...held.filter((tag) => !kept.some(({ id }) => id === tag.id)),
    ]
  }

  return { searchTerm, refusal, menuOpen, enter, enterTyped, pick }
}

const options = useTagOptions()
const { searchTerm, refusal, menuOpen, enter, enterTyped, pick } = useTagEntry()
</script>

<template>
  <!-- Enter here names a Tag; it never submits a form the picker sits in. -->
  <div class="flex flex-col gap-2" @keydown.enter.capture.prevent="enterTyped">
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
      @create="enter"
      @update:model-value="pick"
    />
    <p v-if="refusal" role="alert" class="text-sm text-error">
      {{ refusal }}
    </p>
  </div>
</template>
