<script setup lang="ts">
// PROTOTYPE — pick existing Tags or type a new one. Suggestions are every Tag
// the User already has, alphabetically; a typed Tag matching one in another
// case becomes that one, so "Breakfast" never sits beside "breakfast".
import { createTag, demoFoods, demoTags } from '~/prototype/foodTagsDemo'

const tags = defineModel<string[]>({ required: true })
const known = computed(() => demoTags(demoFoods))

function onCreate(typed: string) {
  const tag = createTag(typed)
  if (!tag) return
  if (!tags.value.some((t) => t.toLowerCase() === tag.toLowerCase()))
    tags.value = [...tags.value, tag]
}
</script>

<template>
  <UInputMenu
    v-model="tags"
    :items="known"
    multiple
    create-item
    placeholder="Add a tag — e.g. breakfast"
    icon="i-lucide-tag"
    class="w-full"
    @create="onCreate"
  />
</template>
