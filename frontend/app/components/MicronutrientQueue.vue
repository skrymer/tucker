<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type UnmatchedFood = components['schemas']['UnmatchedFoodResponse']

/**
 * What is left to do, biggest bite first. One disclosure rather than a list in
 * the card or a section of its own: the queue is a chore, and a chore on display
 * is what a card of one honest sentence would become.
 */
const props = defineProps<{ unmatched: UnmatchedFood[] }>()
const emit = defineEmits<{ match: [UnmatchedFood] }>()

const label = computed(() => {
  const count = props.unmatched.length
  // Named for the state a User can change rather than for what Tucker cannot
  // read, and pluralised — "2 foods is not matched yet" reads as a bug.
  return count === 1
    ? '1 food is not matched yet'
    : `${count} foods are not matched yet`
})
</script>

<template>
  <UCollapsible>
    <!-- `min-h-11`: this is the section's primary control and a phone is
         Tucker's first target, so it gets the same 44px the icon buttons
         elsewhere are sized to. -->
    <UButton
      :label="label"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="subtle"
      block
      class="min-h-11"
      :ui="{
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform',
      }"
    />
    <template #content>
      <ul role="list" class="mt-2 divide-y divide-default">
        <li v-for="item in unmatched" :key="item.foodId">
          <button
            type="button"
            :aria-label="`Match ${formatName(item.name)}`"
            class="flex w-full items-baseline justify-between gap-3 rounded-inset py-2.5 text-left hover:bg-elevated active:bg-elevated"
            @click="emit('match', item)"
          >
            <span class="min-w-0 truncate font-medium text-default">
              {{ formatName(item.name) }}
            </span>
            <!-- Its share of the window, which is why it sorts where it does:
                 the first few taps are most of a week (ADR 0027). -->
            <span class="shrink-0 tabular-nums text-muted">
              {{ Math.round(item.share * 100) }}%
            </span>
          </button>
        </li>
      </ul>
    </template>
  </UCollapsible>
</template>
