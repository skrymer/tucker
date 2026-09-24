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
        <span class="block font-medium text-default">{{ tag.name }}</span>
        <span class="block text-sm text-muted">{{
          foodCount(tag.foodCount)
        }}</span>
      </li>
    </ul>
  </ResponsiveOverlay>
</template>
