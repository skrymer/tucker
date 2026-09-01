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
 * How wide the window the response describes is. Measured off its own bounds so
 * every day count on this card is one number: the seven-day rule is the domain's
 * (`MicronutrientIntake.of`), and a card that restates it in English is where the
 * two get to disagree.
 */
const days = computed(() => daysInWindow(props.intake.from, props.intake.to))

/**
 * What the window can be read for, as a sentence rather than a bar: the number is
 * the whole claim here, and a bar beside it would read as progress toward a full
 * ring that is unreachable by construction (frontend/DESIGN.md, ADR 0027).
 */
const coverage = computed(
  () =>
    `${Math.round(props.intake.coverage * 100)}% of the last ${days.value} days' ` +
    `calories came from food Tucker can read vitamins and minerals for.`,
)

/** How far the sentence above can be trusted, in the sibling card's own words. */
const loggedDays = computed(() =>
  loggedDaysCaption(
    props.intake.loggedDays,
    props.intake.from,
    props.intake.to,
  ),
)

const isEmptyWindow = computed(() => props.intake.totalCalories === 0)

/**
 * The window read as the two things this card draws — tiles for the claims Tucker
 * can make, names for the ones it cannot. Decided in `micronutrientTiles`, so the
 * rule is tested where it lives rather than through rendered markup (ADR 0004).
 */
const reading = computed(() => micronutrientReading(props.intake.rows))

/**
 * The nutrients it cannot claim, as one comma list. Never behind a disclosure: it
 * is two lines, hiding it saves 45px, and hiding it reads as evasive about the one
 * thing the section most needs to admit.
 */
const unstated = computed(() => reading.value.unstated.join(', '))

/**
 * Whether the window can be read for anything at all. Where almost nothing is
 * matched no nutrient earns a claim, and the whole set listed as unsayable
 * wastes the screen without misleading anybody — a judgement about usefulness
 * rather than about honesty, and it doubles as what tells a new User what to do
 * (ADR 0027).
 *
 * Falling out of the claims rather than gating on a coverage threshold: a
 * threshold would be a second arbitrary number, and it would suppress the
 * over-the-limit finding that holds at *any* coverage.
 */
const saysNothing = computed(() => reading.value.groups.length === 0)

/** Whether there is anything left to match, which the queue and its absence share. */
const hasQueue = computed(() => props.intake.unmatched.length > 0)

/**
 * Whether any of the window went unread by something no tap can fix — an estimate
 * or a Recipe. The only case in which there is a rest to attribute: a week of
 * nothing but matched weighed food leaves none, and naming estimates and recipes
 * as its cause would invent one.
 *
 * Read off the rounded percentage rather than compared to 1, so the sentence agrees
 * with the figure printed beside it. Coverage sums its numerator over grouped Foods
 * and its denominator over Entries, so a fully covered week is not guaranteed to
 * land on exactly 1.0, and a bare `< 1` would attribute a rest to a 99.999…% week.
 */
const hasUnreadableRest = computed(
  () => Math.round(props.intake.coverage * 100) < 100,
)

/**
 * Which single note the card puts under the tiles, of the four it has — decided
 * here so the four are exclusive by construction and the choice is a data fact
 * `micronutrientTiles`-style tests can pin, rather than the order of a `v-if`
 * chain whose empty arm is load-bearing.
 *
 * `null` is one of the answers: a fully matched week that still supplies too
 * little of everything has nothing statable *and* nothing left to tap, and asking
 * for matches there contradicts the sentence above it.
 */
const note = computed<'profile' | 'match' | 'unstated' | null>(() => {
  // Nothing resolved to read the window against, so no amount of matching will
  // earn a claim: this is advice about the Profile, not about food.
  if (!props.intake.hasReferenceIntakes) return 'profile'
  if (saysNothing.value) return hasQueue.value ? 'match' : null
  return unstated.value ? 'unstated' : null
})

/**
 * What is left to do, biggest bite first. One disclosure rather than a list in
 * the card or a section of its own: the queue is a chore, and a chore on display
 * is what a card of one honest sentence would become.
 */
const queueLabel = computed(() => {
  const count = props.intake.unmatched.length
  // Named for the state a User can change rather than for what Tucker cannot
  // read, and pluralised — "2 foods is not matched yet" reads as a bug.
  return count === 1
    ? '1 food is not matched yet'
    : `${count} foods are not matched yet`
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
      Nothing logged in the last {{ days }} days.
    </p>
    <template v-else>
      <p class="mt-2 text-sm text-default">{{ coverage }}</p>
      <p class="mt-1 text-sm text-muted">{{ loggedDays }}</p>

      <!-- Once nothing is left, the share still unaccounted for has to be named
           along with why no tap will move it — otherwise it reads as a chore
           undone (ADR 0027). Only where there *is* one: a week of nothing but
           matched weighed food leaves no rest, and attributing an absent
           remainder to estimates and recipes is a confident wrong answer. -->
      <p v-if="!hasQueue" class="mt-2 text-sm text-muted">
        Nothing left to match.<template v-if="hasUnreadableRest">
          The rest came from meals you estimated and from recipes, which have no
          single food to borrow from.</template
        >
      </p>

      <div v-for="group in reading.groups" :key="group.claim" class="mt-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-muted">
          {{ group.heading }}
        </h3>
        <ul role="list" class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <li
            v-for="row in group.tiles"
            :key="row.nutrient"
            role="group"
            :aria-label="row.label"
            class="rounded-lg bg-elevated/50 px-3 py-2"
          >
            <span class="block text-xs text-muted">{{ row.label }}</span>
            <span class="block font-semibold tabular-nums text-default">
              ≥ {{ formatMicronutrientAmount(row.amount, row.unit) }}
            </span>
            <span class="block text-xs text-dimmed">
              {{ row.againstLabel }}
              {{ formatMicronutrientAmount(row.againstAmount, row.unit) }}
            </span>
          </li>
        </ul>
      </div>

      <!-- What the card says under the tiles. Which one is `note`'s to decide, so
           no two of them can contradict each other on one screen. The two states
           behind 'profile' and 'match' look identical here, which is why the
           response says which one it is (ADR 0027). -->
      <p v-if="note === 'profile'" class="mt-3 text-sm text-muted">
        Add your sex and date of birth on Profile, so Tucker knows which
        published figures to read your week against.
      </p>
      <p v-else-if="note === 'match'" class="mt-3 text-sm text-muted">
        Match a few of the foods you eat most and Tucker can start reading your
        vitamins and minerals.
      </p>
      <!-- Names, never figures. A shortfall is not published, so it is not drawn
           either — the structure is what carries that, not the wording. -->
      <p v-else-if="note === 'unstated'" class="mt-3 text-sm text-muted">
        Not enough matched to say: {{ unstated }}.
      </p>

      <UCollapsible v-if="hasQueue" class="mt-3">
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

    <ReferenceFoodAttribution>
      <ReferenceIntakeAttribution />
    </ReferenceFoodAttribution>
  </UCard>
</template>
