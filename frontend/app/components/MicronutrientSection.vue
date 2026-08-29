<script setup lang="ts">
import type { components } from '#open-fetch-schemas/api'

type UnmatchedFood = components['schemas']['UnmatchedFoodResponse']

// Stryker disable all: a compiler macro's arguments are hoisted out of setup()
const props = withDefaults(
  defineProps<{
    intake: components['schemas']['MicronutrientIntakeResponse']
    /**
     * Whether the figures below are being re-read. Keep-stale-and-dim rather
     * than blank: a match refreshes this card, and what is on screen until the
     * answer lands is the coverage from before it (ADR 0007).
     */
    pending?: boolean
  }>(),
  { pending: false },
)
// Stryker restore all
const emit = defineEmits<{ match: [UnmatchedFood] }>()

/**
 * What the window can be read for, as a sentence rather than a bar: the number is
 * the whole claim here, and a bar beside it would read as progress toward a full
 * ring that is unreachable by construction (frontend/DESIGN.md, ADR 0027).
 */
const coverage = computed(
  () =>
    `${Math.round(props.intake.coverage * 100)}% of the last 7 days' calories ` +
    `came from food Tucker can read vitamins and minerals for.`,
)

const isEmptyWindow = computed(() => props.intake.totalCalories === 0)

/**
 * What is left to do, biggest bite first. One disclosure rather than a list in
 * the card or a section of its own: the queue is a chore, and a chore on display
 * is what a card of one honest sentence would become.
 */
const queueLabel = computed(() => {
  const count = props.intake.unmatched.length
  return `${count} ${count === 1 ? 'food' : 'foods'} to match`
})
</script>

<template>
  <UCard
    role="region"
    aria-labelledby="micronutrient-heading"
    :aria-busy="pending"
    class="transition-opacity delay-150"
    :class="pending && 'opacity-50'"
  >
    <h2 id="micronutrient-heading" class="text-sm font-medium text-muted">
      Vitamins and minerals
    </h2>
    <!-- A 0% over a window that ate nothing is true and useless — it reads as a
         failure to match rather than as a week with nothing in it. -->
    <p v-if="isEmptyWindow" class="mt-2 text-sm text-muted">
      Nothing logged in the last 7 days.
    </p>
    <template v-else>
      <p class="mt-2 text-sm text-default">{{ coverage }}</p>

      <!-- Full coverage is unreachable, so once nothing is left the sentence has
           to name what remains and why no tap will move it — otherwise the share
           it leaves unexplained reads as a chore undone (ADR 0027). Nested rather
           than re-testing `isEmptyWindow`: an empty window has an empty queue,
           and stating that twice is what lets the two drift. -->
      <p v-if="intake.unmatched.length === 0" class="mt-2 text-sm text-muted">
        Nothing left to match. The rest came from meals you estimated and from
        recipes, which have no single food to borrow from.
      </p>

      <UCollapsible v-else class="mt-3">
        <!-- `min-h-11`: this is the section's primary control and a phone is
           Tucker's first target, so it gets the same 44px the icon buttons
           elsewhere are sized to. -->
        <UButton
          :label="queueLabel"
          trailing-icon="i-lucide-chevron-down"
          color="neutral"
          variant="subtle"
          block
          class="min-h-11"
          :ui="{
            trailingIcon:
              'group-data-[state=open]:rotate-180 transition-transform',
          }"
        />
        <template #content>
          <ul role="list" class="mt-2 divide-y divide-default">
            <li v-for="item in intake.unmatched" :key="item.foodId">
              <button
                type="button"
                :aria-label="`Match ${item.name}`"
                class="flex w-full items-baseline justify-between gap-3 rounded-md py-2.5 text-left hover:bg-elevated active:bg-elevated"
                @click="emit('match', item)"
              >
                <span class="min-w-0 truncate font-medium text-default">
                  {{ item.name }}
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

    <ReferenceFoodAttribution />
  </UCard>
</template>
