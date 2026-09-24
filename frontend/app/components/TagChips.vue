<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type FoodTag = components['schemas']['FoodTagResponse']

const props = defineProps<{ tags: FoodTag[] }>()
/** The chosen Tag's id, or `null` for "All". */
const chosen = defineModel<number | null>({ required: true })

// "All" is a chip like any other whose id is `null`, so choosing it again is
// already a no-op under the same toggle every Tag uses.
const chips = computed(() => [{ id: null, name: 'All' }, ...props.tags])
</script>

<template>
  <div role="group" aria-label="Filter by tag" class="flex flex-wrap gap-2">
    <UButton
      v-for="tag in chips"
      :key="tag.id ?? 'all'"
      size="sm"
      :variant="chosen === tag.id ? 'solid' : 'outline'"
      :color="chosen === tag.id ? 'primary' : 'neutral'"
      :aria-pressed="chosen === tag.id"
      @click="chosen = chosen === tag.id ? null : tag.id"
    >
      {{ tag.name }}
    </UButton>
  </div>
</template>
