<script setup lang="ts">
// PROTOTYPE — D: the Tag *is* the rotation. Tabs across the top; under a Tag
// there is only a grid holding every Food carrying it, ranked by use then by
// name — no cap, no tail, because a Tag is already a short list. "All" is
// today's page unchanged.
import {
  alphabetical,
  demoTags,
  rankFrequent,
  type DemoFood,
} from '~/prototype/foodTagsDemo'

const props = defineProps<{ foods: DemoFood[]; query: string }>()
const emit = defineEmits<{ pick: [DemoFood] }>()

const tag = ref<string>('all')
const items = computed(() => [
  { label: 'All', value: 'all' },
  ...demoTags(props.foods).map((t) => ({
    label: t.charAt(0).toUpperCase() + t.slice(1),
    value: t,
  })),
])
const filtering = computed(() => props.query.trim().length > 0)
const inTag = computed(() =>
  tag.value === 'all'
    ? props.foods
    : props.foods.filter((f) => f.tags.includes(tag.value)),
)
const tagGrid = computed(() =>
  [...(filterFoods(inTag.value, props.query) as DemoFood[])].sort(
    (a, b) => b.count30d - a.count30d || a.name.localeCompare(b.name),
  ),
)
const frequent = computed(() => rankFrequent(props.foods))
const tail = computed(() =>
  alphabetical(filterFoods(props.foods, props.query) as DemoFood[]),
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <SectionTabs v-model="tag" :items="items" label="Tag" />
    </div>

    <template v-if="tag === 'all'">
      <section v-if="!filtering">
        <h2
          class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase"
        >
          Frequent foods
        </h2>
        <FrequentFoodsGrid
          :foods="frequent as any"
          @pick="(f: any) => emit('pick', f)"
        />
      </section>
      <section>
        <h2
          class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase"
        >
          {{ filtering ? 'Matching foods' : 'All foods' }}
        </h2>
        <FoodPickList
          :foods="tail as any"
          @pick="(f: any) => emit('pick', f)"
        />
      </section>
    </template>

    <section v-else>
      <h2 class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase">
        {{ tag }}
        <span class="normal-case text-muted">({{ tagGrid.length }})</span>
      </h2>
      <FrequentFoodsGrid
        :foods="tagGrid as any"
        @pick="(f: any) => emit('pick', f)"
      />
    </section>
  </div>
</template>
