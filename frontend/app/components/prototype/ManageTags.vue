<script setup lang="ts">
// PROTOTYPE — every Tag the User has, with how many Foods carry it; create,
// rename (onto an existing name merges) and delete (off every Food).
import {
  createTag,
  deleteTag,
  demoFoods,
  demoTags,
  renameTag,
  tagCount,
} from '~/prototype/foodTagsDemo'

const open = defineModel<boolean>('open', { required: true })

const tags = computed(() => demoTags(demoFoods))
const newTag = ref('')
const renaming = ref<string | null>(null)
const renameTo = ref('')
const deleting = ref<string | null>(null)

function add() {
  createTag(newTag.value)
  newTag.value = ''
}
function startRename(tag: string) {
  deleting.value = null
  renaming.value = tag
  renameTo.value = tag
}
function commitRename() {
  if (renaming.value) renameTag(renaming.value, renameTo.value)
  renaming.value = null
}
/** Renaming onto a Tag that exists (any case) merges — said before it happens. */
const mergesInto = computed(() => {
  const to = renameTo.value.trim().toLowerCase()
  if (!renaming.value || !to || to === renaming.value.toLowerCase()) return null
  return tags.value.find((t) => t !== renaming.value && t.toLowerCase() === to)
})
function foods(n: number) {
  return n === 1 ? '1 food' : `${n} foods`
}
</script>

<template>
  <ResponsiveOverlay v-model:open="open" title="Tags">
    <div class="flex flex-col gap-4">
      <form class="flex gap-2" @submit.prevent="add">
        <UInput
          v-model="newTag"
          placeholder="New tag"
          aria-label="New tag"
          icon="i-lucide-tag"
          class="flex-1"
        />
        <UButton type="submit" color="neutral" variant="outline">Add</UButton>
      </form>

      <p v-if="tags.length === 0" class="py-4 text-center text-sm text-muted">
        No tags yet.
      </p>

      <ul role="list" class="divide-y divide-default">
        <li v-for="tag in tags" :key="tag" class="py-2">
          <!-- renaming -->
          <form
            v-if="renaming === tag"
            class="flex flex-col gap-1"
            @submit.prevent="commitRename"
          >
            <div class="flex items-center gap-2">
              <UInput
                v-model="renameTo"
                :aria-label="`Rename ${tag}`"
                autofocus
                class="flex-1"
              />
              <UButton type="submit" color="primary" size="sm">
                {{ mergesInto ? 'Merge' : 'Save' }}
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                @click="renaming = null"
              >
                Cancel
              </UButton>
            </div>
            <p v-if="mergesInto" class="text-xs text-warning">
              “{{ mergesInto }}” already exists — its
              {{ foods(tagCount(mergesInto)) }} and this Tag's
              {{ foods(tagCount(tag)) }} become one Tag.
            </p>
          </form>

          <!-- confirming a delete -->
          <div v-else-if="deleting === tag" class="flex items-center gap-2">
            <span class="flex-1 text-sm">
              Delete “{{ tag }}”?
              <span class="text-muted">
                {{
                  tagCount(tag)
                    ? `It comes off ${foods(tagCount(tag))}; the Foods stay.`
                    : 'No Foods carry it.'
                }}
              </span>
            </span>
            <UButton
              color="error"
              size="sm"
              @click="
                () => {
                  deleteTag(tag)
                  deleting = null
                }
              "
            >
              Delete
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              @click="deleting = null"
            >
              Cancel
            </UButton>
          </div>

          <!-- at rest -->
          <div v-else class="flex items-center gap-1">
            <span class="flex-1">
              <span class="font-medium text-default">{{ tag }}</span>
              <span class="block text-sm text-muted">{{
                foods(tagCount(tag))
              }}</span>
            </span>
            <UButton
              :aria-label="`Rename ${tag}`"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              square
              class="size-11 justify-center text-muted"
              @click="startRename(tag)"
            />
            <UButton
              :aria-label="`Delete ${tag}`"
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              square
              class="size-11 justify-center text-muted"
              @click="
                () => {
                  renaming = null
                  deleting = tag
                }
              "
            />
          </div>
        </li>
      </ul>
    </div>
  </ResponsiveOverlay>
</template>
