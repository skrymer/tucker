<script setup lang="ts">
// PROTOTYPE — B: a Tag is a query. Picking one collapses the page into one
// flat alphabetical list, exactly as typing does — the grid goes away.
import {
  alphabetical,
  carriedTags,
  rankFrequent,
  type DemoFood,
} from '~/prototype/foodTagsDemo'

const props = defineProps<{ foods: DemoFood[]; query: string }>()
const emit = defineEmits<{ pick: [DemoFood] }>()

const tag = ref<string | null>(null)
const tags = computed(() => carriedTags(props.foods))
const narrowing = computed(
  () => tag.value !== null || props.query.trim().length > 0,
)
const heading = computed(() => {
  const q = props.query.trim()
  if (tag.value && q) return `${tag.value} foods matching “${q}”`
  return tag.value ? `${tag.value} foods` : 'Matching foods'
})
const frequent = computed(() => rankFrequent(props.foods))
const matches = computed(() =>
  alphabetical(
    filterFoods(
      tag.value
        ? props.foods.filter((f) => f.tags.includes(tag.value!))
        : props.foods,
      props.query,
    ) as DemoFood[],
  ),
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <PrototypeTagChips v-model="tag" :tags="tags" />

    <template v-if="narrowing">
      <section>
        <h2
          class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase"
        >
          {{ heading }}
          <span class="text-muted normal-case">({{ matches.length }})</span>
        </h2>
        <FoodPickList
          v-if="matches.length"
          :foods="matches as any"
          @pick="(f: any) => emit('pick', f)"
        />
        <p v-else class="py-4 text-center text-sm text-muted">
          No {{ tag ?? '' }} foods match “{{ query.trim() }}”.
        </p>
      </section>
    </template>

    <template v-else>
      <section>
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
          All foods
        </h2>
        <FoodPickList
          :foods="alphabetical(foods) as any"
          @pick="(f: any) => emit('pick', f)"
        />
      </section>
    </template>
  </div>
</template>
