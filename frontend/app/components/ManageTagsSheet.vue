<script setup lang="ts">
import { z } from 'zod'

// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: [] }>()

const { $api } = useNuxtApp()

/** Every Tag the User keeps, read afresh each time the sheet opens. */
function useTagList() {
  const {
    data: tags,
    error,
    load,
  } = useOptionalFetch((signal) => $api('/api/tags', { signal }))
  watch(open, (isOpen) => isOpen && load(), { immediate: true })
  return { tags, error, load }
}

const { tags, error, load } = useTagList()

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name for this tag')
    .max(30, 'A tag name is at most 30 characters'),
})

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

/**
 * Deleting a Tag takes it off every Food and deletes no Food (ADR 0033), so the page
 * is told its Foods changed.
 */
const { execute: deleteTag } = useApiMutation(
  (id: number) => $api('/api/tags/{id}', { method: 'DELETE', path: { id } }),
  {
    // No success toast: the row leaves the list.
    errorTitle: 'Could not delete tag',
    onSuccess: () => {
      confirming.value = null
      emit('changed')
      return load()
    },
  },
)

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
    <LoadErrorState
      :error="error"
      title="Couldn't load your tags"
      @retry="load"
    >
      <p v-if="tags?.length === 0" class="py-4 text-center text-sm text-muted">
        No tags yet.
      </p>
      <ul role="list" class="divide-y divide-default">
        <li v-for="tag in tags ?? []" :key="tag.id" class="py-2">
          <div v-if="confirming === tag.id" class="flex flex-col gap-2">
            <p v-if="tag.foodCount === 0" class="text-sm text-default">
              Delete “{{ tag.name }}”? No foods carry it.
            </p>
            <p v-else class="text-sm text-default">
              Delete “{{ tag.name }}”? It comes off
              {{ foodCount(tag.foodCount) }}. The foods stay in your catalog.
            </p>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="confirming = null"
              >
                Cancel
              </UButton>
              <UButton color="error" @click="deleteTag(tag.id)">
                Delete tag
              </UButton>
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
    </LoadErrorState>
  </ResponsiveOverlay>
</template>
