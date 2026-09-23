<script setup lang="ts">
// PROTOTYPE — /foods over the demo catalog: each row shows its Tags and gains a
// tag action beside view / delete. Edits land in the same in-memory store /log
// reads, so a Tag added here is a chip there.
import {
  alphabetical,
  demoFoods,
  type DemoFood,
} from '~/prototype/foodTagsDemo'

const foods = computed(() => alphabetical(demoFoods))
const editing = ref<DemoFood | null>(null)
const draft = ref<string[]>([])
const open = computed({
  get: () => editing.value !== null,
  set: (v) => {
    if (!v) editing.value = null
  },
})

function edit(food: DemoFood) {
  editing.value = food
  draft.value = [...food.tags]
}
function save() {
  if (editing.value) editing.value.tags = [...draft.value]
  editing.value = null
}
</script>

<template>
  <ul role="list" class="divide-y divide-default">
    <li v-for="food in foods" :key="food.id" class="flex items-center gap-1">
      <FigureRow
        class="flex-1 py-3"
        :name="food.name"
        :figures="formatPer100g(food)"
      >
        <template #marker>
          <RecipeBadge v-if="food.kind === 'RECIPE'" />
        </template>
        <span v-if="food.tags.length" class="mt-1 flex flex-wrap gap-1">
          <UBadge
            v-for="tag in [...food.tags].sort()"
            :key="tag"
            :label="tag"
            color="neutral"
            variant="soft"
            size="sm"
          />
        </span>
      </FigureRow>
      <UButton
        :aria-label="`Tags for ${formatName(food.name)}`"
        icon="i-lucide-tag"
        color="neutral"
        variant="ghost"
        square
        class="size-11 shrink-0 text-muted hover:text-default"
        :ui="{ base: 'justify-center' }"
        @click="edit(food)"
      />
      <UButton
        :aria-label="`Delete ${formatName(food.name)}`"
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        square
        class="size-11 shrink-0 text-muted hover:text-default"
        :ui="{ base: 'justify-center' }"
      />
    </li>
  </ul>

  <ResponsiveOverlay
    v-model:open="open"
    :title="editing ? `Tags for ${formatName(editing.name)}` : 'Tags'"
  >
    <div class="flex flex-col gap-4">
      <PrototypeTagPicker v-model="draft" />
      <UButton color="primary" class="w-full" @click="save">Save tags</UButton>
    </div>
  </ResponsiveOverlay>
</template>
