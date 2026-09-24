<script setup lang="ts">
// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const open = defineModel<boolean>('open', { required: true })

const { $api } = useNuxtApp()

/** Every Tag the User keeps, read afresh each time the sheet opens. */
function useTagList() {
  const { data: tags, load } = useOptionalFetch((signal) =>
    $api('/api/tags', { signal }),
  )
  watch(open, (isOpen) => isOpen && load(), { immediate: true })
  return { tags }
}

const { tags } = useTagList()

function foodCount(count: number) {
  return count === 1 ? '1 food' : `${count} foods`
}
</script>

<template>
  <ResponsiveOverlay v-model:open="open" title="Manage tags">
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
