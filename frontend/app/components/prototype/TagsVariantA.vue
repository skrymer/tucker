<script setup lang="ts">
// PROTOTYPE — A: a chip narrows both sections. The grid is Frequent Foods
// ranked *within* the Tag (backend `?tag=`), the tail is the tagged catalog.
import {
  alphabetical,
  demoTags,
  rankFrequent,
  type DemoFood,
} from '~/prototype/foodTagsDemo'

const props = defineProps<{ foods: DemoFood[]; query: string }>()
const emit = defineEmits<{ pick: [DemoFood] }>()

const tag = ref<string | null>(null)
const tags = computed(() => demoTags(props.foods))
const inTag = computed(() =>
  tag.value
    ? props.foods.filter((f) => f.tags.includes(tag.value!))
    : props.foods,
)
const filtering = computed(() => props.query.trim().length > 0)
const frequent = computed(() => rankFrequent(inTag.value))
const tail = computed(() =>
  alphabetical(filterFoods(inTag.value, props.query) as DemoFood[]),
)
const suffix = computed(() => (tag.value ? ` · ${tag.value}` : ''))
</script>

<template>
  <div class="flex flex-col gap-4">
    <PrototypeTagChips v-model="tag" :tags="tags" />

    <section v-if="!filtering && frequent.length > 0">
      <h2 class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase">
        Frequent foods{{ suffix }}
      </h2>
      <FrequentFoodsGrid
        :foods="frequent as any"
        @pick="(f: any) => emit('pick', f)"
      />
    </section>

    <section>
      <h2 class="mb-2 text-xs font-medium tracking-wide text-dimmed uppercase">
        {{
          filtering ? 'Matching foods' : tag ? `All ${tag} foods` : 'All foods'
        }}{{ filtering ? suffix : '' }}
        <span class="text-muted normal-case">({{ tail.length }})</span>
      </h2>
      <FoodPickList :foods="tail as any" @pick="(f: any) => emit('pick', f)" />
    </section>
  </div>
</template>
