<script setup lang="ts">
import { z } from 'zod'

// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const open = defineModel<boolean>('open', { required: true })

const { $api } = useNuxtApp()

/** Every Tag the User keeps, read afresh each time the sheet opens. */
function useTagList() {
  const { data: tags, load } = useOptionalFetch((signal) =>
    $api('/api/tags', { signal }),
  )
  watch(open, (isOpen) => isOpen && load(), { immediate: true })
  return { tags, load }
}

const { tags, load } = useTagList()

const schema = z.object({ name: z.string().min(1) })

/** Naming a Tag before tagging anything with it; the list is re-read once it exists. */
function useTagCreation() {
  const draft = reactive({ name: '' })
  const { execute: create } = useApiMutation(
    (name: string) => $api('/api/tags', { method: 'POST', body: { name } }),
    {
      errorTitle: 'Could not add tag',
      onSuccess: () => {
        draft.name = ''
        return load()
      },
    },
  )
  return { draft, submit: () => create(draft.name) }
}

const { draft, submit } = useTagCreation()

/** The Tag whose delete is being asked about. */
const confirming = ref<number | null>(null)

function foodCount(count: number) {
  return count === 1 ? '1 food' : `${count} foods`
}
</script>

<template>
  <ResponsiveOverlay v-model:open="open" title="Manage tags">
    <UForm
      :schema="schema"
      :state="draft"
      class="flex items-start gap-2"
      @submit="submit"
    >
      <UFormField name="name" class="flex-1">
        <UInput
          v-model="draft.name"
          placeholder="New tag"
          aria-label="New tag"
          icon="i-lucide-tag"
          class="w-full"
        />
      </UFormField>
      <UButton type="submit" color="neutral" variant="outline">Add</UButton>
    </UForm>
    <ul role="list" class="divide-y divide-default">
      <li v-for="tag in tags ?? []" :key="tag.id" class="py-2">
        <div v-if="confirming === tag.id" class="flex flex-col gap-2">
          <p class="text-sm text-default">
            Delete “{{ tag.name }}”? It comes off
            {{ foodCount(tag.foodCount) }}. The foods stay in your catalog.
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost">Cancel</UButton>
            <UButton color="error">Delete tag</UButton>
          </div>
        </div>
        <div v-else class="flex items-center gap-1">
          <span class="flex-1">
            <span class="block font-medium text-default">{{ tag.name }}</span>
            <span class="block text-sm text-muted">{{
              foodCount(tag.foodCount)
            }}</span>
          </span>
          <UButton
            :aria-label="`Delete ${tag.name}`"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            square
            class="size-11 justify-center text-muted"
            @click="confirming = tag.id"
          />
        </div>
      </li>
    </ul>
  </ResponsiveOverlay>
</template>
