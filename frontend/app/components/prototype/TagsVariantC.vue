<script setup lang="ts">
// PROTOTYPE — C: no filter action at all. The grid stays as it is; the
// catalog below it is grouped by Tag (a Food with two Tags sits in both),
// each group collapsible, untagged last. Scroll, don't choose.
import {
  alphabetical,
  demoTags,
  rankFrequent,
  type DemoFood,
} from '~/prototype/foodTagsDemo'

const props = defineProps<{ foods: DemoFood[]; query: string }>()
const emit = defineEmits<{ pick: [DemoFood] }>()

const filtering = computed(() => props.query.trim().length > 0)
const frequent = computed(() => rankFrequent(props.foods))
const shown = computed(
  () => filterFoods(props.foods, props.query) as DemoFood[],
)
const groups = computed(() => {
  const g = demoTags(shown.value).map((tag) => ({
    tag,
    foods: alphabetical(shown.value.filter((f) => f.tags.includes(tag))),
  }))
  const untagged = shown.value.filter((f) => f.tags.length === 0)
  if (untagged.length)
    g.push({ tag: 'untagged', foods: alphabetical(untagged) })
  return g
})
const closed = ref(new Set<string>())
function toggle(tag: string) {
  const s = new Set(closed.value)
  if (s.has(tag)) s.delete(tag)
  else s.add(tag)
  closed.value = s
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section v-if="!filtering">
      <h2 class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase">
        Frequent foods
      </h2>
      <FrequentFoodsGrid
        :foods="frequent as any"
        @pick="(f: any) => emit('pick', f)"
      />
    </section>

    <section v-for="g in groups" :key="g.tag">
      <button
        type="button"
        class="sticky top-0 z-10 flex w-full items-center justify-between bg-default py-2 text-left"
        :aria-expanded="!closed.has(g.tag)"
        @click="toggle(g.tag)"
      >
        <span
          class="text-xs font-medium tracking-wide text-dimmed uppercase"
          :class="g.tag === 'untagged' ? 'italic' : ''"
        >
          {{ g.tag }}
          <span class="normal-case text-muted">({{ g.foods.length }})</span>
        </span>
        <UIcon
          :name="
            closed.has(g.tag) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'
          "
          class="size-4 text-muted"
        />
      </button>
      <FoodPickList
        v-if="!closed.has(g.tag)"
        :foods="g.foods as any"
        @pick="(f: any) => emit('pick', f)"
      />
    </section>
  </div>
</template>
