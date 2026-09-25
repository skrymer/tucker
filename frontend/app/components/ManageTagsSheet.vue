<script setup lang="ts">
import { z } from 'zod'

// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: [] }>()

const { $api } = useNuxtApp()

// The rename field takes focus on desktop only: on a phone that focus pops the
// keyboard over the sheet, as LogGramsSheet records.
const isDesktop = useIsDesktop()

/**
 * Every Tag the User keeps, read afresh each time the sheet opens. A re-read supersedes
 * one in flight, which may have been answered before the change that asked for it.
 */
function useTagList() {
  const {
    data: tags,
    error,
    load,
  } = useOptionalFetch((signal) => $api('/api/tags', { signal }), {
    mode: 'latest',
  })
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
  /** The server's refusal of the name typed, stated beside the field until it is edited. */
  const refusal = ref<string | undefined>()
  watch(
    () => draft.name,
    () => (refusal.value = undefined),
  )
  const { execute: create, pending: creating } = useApiMutation(
    (name: string) => $api('/api/tags', { method: 'POST', body: { name } }),
    {
      errorTitle: 'Could not add tag',
      // No Retry: the same name would be refused again.
      onValidationError: (message) => (refusal.value = message),
      onSuccess: () => {
        draft.name = ''
        return load()
      },
    },
  )
  return { draft, refusal, creating, submit: () => create(draft.name) }
}

const { draft, refusal, creating, submit } = useTagCreation()

/**
 * The one row asking something — a rename or a delete — so asking on one row drops
 * whatever another was asking. Each opening starts at rest.
 */
function useRowQuestion() {
  const asking = ref<{ id: number; kind: 'rename' | 'delete' } | null>(null)
  watch(open, () => (asking.value = null))
  return {
    asking,
    isAsking: (id: number, kind: 'rename' | 'delete') =>
      asking.value?.id === id && asking.value.kind === kind,
    ask: (id: number, kind: 'rename' | 'delete') =>
      (asking.value = { id, kind }),
    settle: () => (asking.value = null),
  }
}

const { asking, isAsking, ask, settle } = useRowQuestion()

/**
 * Deleting a Tag, once its row has asked. It takes the Tag off every Food and deletes
 * no Food (ADR 0033), so the page is told its Foods changed.
 */
function useTagDeletion() {
  const { execute: deleteTag, pending: deleting } = useApiMutation(
    (id: number) => $api('/api/tags/{id}', { method: 'DELETE', path: { id } }),
    {
      // No success toast: the row leaves the list.
      errorTitle: 'Could not delete tag',
      onSuccess: () => {
        settle()
        emit('changed')
        return load()
      },
    },
  )
  return { deleteTag, deleting }
}

const { deleteTag, deleting } = useTagDeletion()

/**
 * Renaming a Tag from its row. Every Food carrying it follows, so the page is told
 * its Foods changed.
 */
function useTagRename() {
  const renameDraft = reactive({ name: '' })
  /** The server's refusal of the new name, stated beside the field until it is edited. */
  const renameRefusal = ref<string | undefined>()
  watch(
    () => renameDraft.name,
    () => (renameRefusal.value = undefined),
  )
  function startRename(tag: { id: number; name: string }) {
    ask(tag.id, 'rename')
    renameDraft.name = tag.name
  }
  const { execute: rename, pending: renamePending } = useApiMutation(
    (id: number, name: string) =>
      $api('/api/tags/{id}', { method: 'PUT', path: { id }, body: { name } }),
    {
      errorTitle: 'Could not rename tag',
      // No Retry: the same name would be refused again.
      onValidationError: (message) => (renameRefusal.value = message),
      onSuccess: () => {
        settle()
        emit('changed')
        return load()
      },
    },
  )
  /**
   * The other Tag the name typed already belongs to, in any case — so the rename is
   * a merge into it. A preview over the Tags fetched; the server decides (ADR 0002).
   */
  const mergesInto = computed(() => {
    const typed = tagNameKey(renameDraft.name)
    return tags.value?.find(
      (tag) => tag.id !== asking.value?.id && tagNameKey(tag.name) === typed,
    )
  })
  return {
    renameDraft,
    renameRefusal,
    renamePending,
    mergesInto,
    startRename,
    submitRename: (id: number) => rename(id, renameDraft.name),
  }
}

const {
  renameDraft,
  renameRefusal,
  renamePending,
  mergesInto,
  startRename,
  submitRename,
} = useTagRename()

function foodCount(count: number) {
  return count === 1 ? '1 food' : `${count} foods`
}

function mergeWarning(
  into: { name: string; foodCount: number },
  renamed: { foodCount: number },
) {
  return `“${into.name}” already exists — its ${foodCount(into.foodCount)} and this tag’s ${foodCount(renamed.foodCount)} become one tag.`
}

function deleteQuestion(tag: { name: string; foodCount: number }) {
  const opening = `Delete “${tag.name}”?`
  return tag.foodCount === 0
    ? `${opening} No foods carry it.`
    : `${opening} It comes off ${foodCount(tag.foodCount)}. The foods stay in your catalog.`
}
</script>

<template>
  <ResponsiveOverlay v-model:open="open" title="Manage tags">
    <!-- Validates a keystroke as it lands: a delayed one can fire after a create has
         emptied the field, and complain about a name nobody is typing. Blurring the
         emptied field afterwards still says so, as any required field does. -->
    <UForm
      :schema="schema"
      :state="draft"
      :validate-on-input-delay="0"
      class="flex items-start gap-2"
      @submit="submit"
    >
      <UFormField name="name" :error="refusal" class="flex-1">
        <UInput
          v-model="draft.name"
          placeholder="New tag"
          aria-label="New tag"
          icon="i-lucide-tag"
          class="w-full"
        />
      </UFormField>
      <UButton
        type="submit"
        color="neutral"
        variant="outline"
        :loading="creating"
      >
        Add
      </UButton>
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
          <UForm
            v-if="isAsking(tag.id, 'rename')"
            :schema="schema"
            :state="renameDraft"
            class="flex flex-col gap-2"
            @submit="submitRename(tag.id)"
          >
            <div class="flex items-start gap-2">
              <UFormField name="name" :error="renameRefusal" class="flex-1">
                <UInput
                  v-model="renameDraft.name"
                  :aria-label="`Rename ${tag.name}`"
                  :autofocus="isDesktop"
                  class="w-full"
                />
              </UFormField>
              <UButton type="submit" :loading="renamePending">{{
                mergesInto ? 'Merge' : 'Save'
              }}</UButton>
              <UButton color="neutral" variant="ghost" @click="settle">
                Cancel
              </UButton>
            </div>
            <p v-if="mergesInto" class="text-sm text-default">
              {{ mergeWarning(mergesInto, tag) }}
            </p>
          </UForm>
          <div
            v-else-if="isAsking(tag.id, 'delete')"
            class="flex flex-col gap-2"
          >
            <p class="text-sm text-default">{{ deleteQuestion(tag) }}</p>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="settle">
                Cancel
              </UButton>
              <UButton
                color="error"
                :loading="deleting"
                @click="deleteTag(tag.id)"
              >
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
              :aria-label="`Rename ${tag.name}`"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              square
              class="size-11 justify-center text-muted"
              @click="startRename(tag)"
            />
            <UButton
              :aria-label="`Delete ${tag.name}`"
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              square
              class="size-11 justify-center text-muted"
              @click="ask(tag.id, 'delete')"
            />
          </div>
        </li>
      </ul>
    </LoadErrorState>
  </ResponsiveOverlay>
</template>
