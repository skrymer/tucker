<script setup lang="ts">
/**
 * PROTOTYPE — throwaway. Delete once the question is answered (see NOTES below).
 *
 * QUESTION: where should logging an Entry live, and what should the nav shell be?
 *
 *   A — Foods page, ranked     status quo + a Frequent section; logging stays a row tap on /foods
 *   B — Log tab                logging becomes its own primary destination; Foods is demoted
 *   C — Today sheet as a list  Today's sheet swaps its typeahead for the same tappable rows
 *
 * All three render the PROPOSED shell — three primary tabs + a "More" sheet for
 * the secondary destinations — so the only variable under test is where logging
 * lives. Switch with ?variant=A|B|C, the top bar, or the ← / → keys.
 *
 * JUDGE IT ON A PHONE VIEWPORT. That is where the friction is.
 *
 * Stub data only: no API calls, no mutations, no tests, no persistence.
 */
definePageMeta({ layout: false })

const VARIANTS = [
  { key: 'A', name: 'Foods page, ranked' },
  { key: 'B', name: 'Log tab' },
  { key: 'C', name: 'Today sheet as list' },
] as const
type VariantKey = (typeof VARIANTS)[number]['key']
type Screen = 'today' | 'foods' | 'log' | 'review'

const route = useRoute()
const router = useRouter()
const isDesktop = useIsDesktop()

const variant = computed<VariantKey>(() => {
  const q = route.query.variant
  const found = VARIANTS.find((v) => v.key === q)
  return found ? found.key : 'A'
})
const variantName = computed(
  () => VARIANTS.find((v) => v.key === variant.value)!.name,
)

function cycle(delta: number) {
  const i = VARIANTS.findIndex((v) => v.key === variant.value)
  const next = VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length]!.key
  router.replace({ query: { ...route.query, variant: next } })
}

function onKey(e: KeyboardEvent) {
  const el = document.activeElement
  const typing =
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  if (typing) return
  if (e.key === 'ArrowLeft') cycle(-1)
  if (e.key === 'ArrowRight') cycle(1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// ---------------------------------------------------------------- stub data

interface Food {
  id: number
  name: string
  kcal: number
  protein: number
  logs: number
  recipe?: boolean
  ingredients?: number
}

const FOODS: Food[] = [
  { id: 1, name: 'Rolled oats', kcal: 379, protein: 13.2, logs: 46 },
  { id: 2, name: 'Free-range eggs', kcal: 143, protein: 12.6, logs: 41 },
  { id: 3, name: 'Chicken breast, raw', kcal: 106, protein: 23.1, logs: 38 },
  { id: 4, name: 'Greek yoghurt 4%', kcal: 97, protein: 9.0, logs: 33 },
  { id: 5, name: 'Kangaroo mince', kcal: 98, protein: 21.9, logs: 27 },
  {
    id: 6,
    name: 'Weekday chilli',
    kcal: 121,
    protein: 11.4,
    logs: 22,
    recipe: true,
    ingredients: 7,
  },
  { id: 7, name: 'Banana', kcal: 89, protein: 1.1, logs: 19 },
  { id: 8, name: 'Wholemeal bread', kcal: 247, protein: 9.7, logs: 17 },
  { id: 9, name: 'Peanut butter', kcal: 598, protein: 25.1, logs: 14 },
  { id: 10, name: 'Basmati rice, dry', kcal: 356, protein: 8.1, logs: 12 },
  { id: 11, name: 'Almonds', kcal: 604, protein: 21.2, logs: 8 },
  { id: 12, name: 'Cheddar', kcal: 416, protein: 25.4, logs: 6 },
  { id: 13, name: 'Olive oil', kcal: 884, protein: 0, logs: 5 },
  { id: 14, name: 'Protein powder', kcal: 375, protein: 78.0, logs: 4 },
  { id: 15, name: 'Tinned tuna', kcal: 116, protein: 25.5, logs: 3 },
  { id: 16, name: 'Avocado', kcal: 160, protein: 2.0, logs: 2 },
  { id: 17, name: 'Sourdough starter loaf', kcal: 258, protein: 8.4, logs: 1 },
]

const top10 = computed(() =>
  [...FOODS].sort((a, b) => b.logs - a.logs).slice(0, 10),
)
const top10Ids = computed(() => new Set(top10.value.map((f) => f.id)))
const byName = computed(() =>
  [...FOODS].sort((a, b) => a.name.localeCompare(b.name)),
)
const restByName = computed(() =>
  byName.value.filter((f) => !top10Ids.value.has(f.id)),
)

const BUDGET = 1900
const FLOOR = 150
const todayEntries = [
  { name: 'Rolled oats', detail: '80 g', kcal: 303, protein: 11 },
  { name: 'Free-range eggs', detail: '120 g', kcal: 172, protein: 15 },
  { name: 'Weekday chilli', detail: '350 g', kcal: 424, protein: 40 },
  { name: 'Flat white', detail: 'estimate', kcal: 120, protein: 6 },
]
const consumed = todayEntries.reduce((n, e) => n + e.kcal, 0)
const proteinSoFar = todayEntries.reduce((n, e) => n + e.protein, 0)
const remaining = BUDGET - consumed

// ------------------------------------------------------------------- shell

const screen = ref<Screen>('today')
watch(variant, () => {
  screen.value = 'today'
  moreOpen.value = false
})

const shell = computed(() =>
  variant.value === 'B'
    ? {
        primary: [
          { key: 'today' as Screen, label: 'Today', icon: 'i-lucide-house' },
          {
            key: 'log' as Screen,
            label: 'Log',
            icon: 'i-lucide-circle-plus',
          },
          {
            key: 'review' as Screen,
            label: 'Review',
            icon: 'i-lucide-trending-down',
          },
        ],
        more: ['Foods', 'Check', 'Profile'],
      }
    : {
        primary: [
          { key: 'today' as Screen, label: 'Today', icon: 'i-lucide-house' },
          { key: 'foods' as Screen, label: 'Foods', icon: 'i-lucide-apple' },
          {
            key: 'review' as Screen,
            label: 'Review',
            icon: 'i-lucide-trending-down',
          },
        ],
        more: ['Check', 'Profile'],
      },
)

const moreOpen = ref(false)

// ------------------------------------------------------- the logging action

/** Open in C: Today's sheet, holding the whole list. */
const listSheetOpen = ref(false)
/** The Food whose grams are being entered. */
const sheetFood = ref<Food | null>(null)
const grams = ref<number | undefined>(undefined)
const warned = ref(false)
/** Surfaced state: what the last (pretend) submit logged. */
const lastLogged = ref<string | null>(null)

function pick(food: Food) {
  sheetFood.value = food
  grams.value = undefined
  warned.value = false
  listSheetOpen.value = false
}

const projectedKcal = computed(() =>
  sheetFood.value && grams.value
    ? Math.round((sheetFood.value.kcal * grams.value) / 100)
    : 0,
)
const overBy = computed(() => Math.max(0, projectedKcal.value - remaining))

// The Budget Projection gate the real /foods row tap skips entirely: over
// budget it warns, and only the next deliberate tap commits.
function submitGrams() {
  if (overBy.value > 0 && !warned.value) {
    warned.value = true
    return
  }
  lastLogged.value = `${sheetFood.value!.name} · ${grams.value} g · ${projectedKcal.value} kcal`
  sheetFood.value = null
}
watch(grams, () => {
  warned.value = false
})
</script>

<template>
  <div class="app-canvas min-h-dvh">
    <!-- ============================ prototype chrome ======================= -->
    <!-- Top, not bottom: the bottom is occupied by the nav being judged. -->
    <div
      class="fixed inset-x-0 top-0 z-50 flex justify-center p-2"
      aria-hidden="true"
    >
      <div
        class="flex items-center gap-1 rounded-full bg-inverted/90 px-2 py-1 shadow-lg backdrop-blur"
      >
        <UButton
          icon="i-lucide-chevron-left"
          size="xs"
          color="neutral"
          variant="ghost"
          class="text-inverted"
          @click="cycle(-1)"
        />
        <span class="px-1 text-xs font-medium whitespace-nowrap text-inverted">
          {{ variant }} — {{ variantName }}
        </span>
        <UButton
          icon="i-lucide-chevron-right"
          size="xs"
          color="neutral"
          variant="ghost"
          class="text-inverted"
          @click="cycle(1)"
        />
      </div>
    </div>

    <!-- ============================== side nav ============================= -->
    <nav
      class="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-default bg-default"
    >
      <div class="flex items-center gap-2 px-5 py-4">
        <UIcon name="i-lucide-salad" class="size-6 text-primary" />
        <span class="text-lg font-bold text-default">Tucker</span>
      </div>
      <div class="flex flex-col gap-1 p-3">
        <button
          v-for="d in shell.primary"
          :key="d.key"
          type="button"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="
            screen === d.key
              ? 'bg-primary/10 text-primary'
              : 'text-muted hover:bg-elevated hover:text-default'
          "
          @click="screen = d.key"
        >
          <UIcon :name="d.icon" class="size-5 shrink-0" />
          {{ d.label }}
        </button>
      </div>
      <div class="mt-2 border-t border-default p-3">
        <p class="px-3 pb-1 text-xs font-medium text-dimmed">More</p>
        <button
          v-for="m in shell.more"
          :key="m"
          type="button"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-elevated"
        >
          <UIcon name="i-lucide-dot" class="size-5 shrink-0" />
          {{ m }}
        </button>
      </div>
    </nav>

    <!-- =============================== body =============================== -->
    <div class="lg:pl-60">
      <main class="mx-auto w-full max-w-2xl p-4 pt-12 pb-28 lg:p-6 lg:pb-10">
        <!-- surfaced state -->
        <p
          v-if="lastLogged"
          class="mb-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
        >
          Entry logged — {{ lastLogged }}
        </p>

        <!-- ---------------------------------------------------- TODAY ----- -->
        <section v-if="screen === 'today'" class="flex flex-col gap-4">
          <header class="flex items-center justify-between">
            <h1 class="text-2xl font-bold text-default">Today</h1>
            <UButton
              v-if="isDesktop && variant !== 'B'"
              icon="i-lucide-plus"
              color="primary"
              @click="
                variant === 'C' ? (listSheetOpen = true) : (screen = 'foods')
              "
            >
              Log entry
            </UButton>
          </header>

          <div class="rounded-2xl border border-default bg-default p-4">
            <div class="flex items-baseline justify-between">
              <p class="text-sm text-muted">Calories</p>
              <p class="text-sm font-medium text-default">
                {{ consumed }} / {{ BUDGET }} kcal
              </p>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-elevated">
              <div
                class="h-full rounded-full bg-primary"
                :style="{ width: `${(consumed / BUDGET) * 100}%` }"
              />
            </div>
            <div class="mt-3 flex items-baseline justify-between">
              <p class="text-sm text-muted">Protein</p>
              <p class="text-sm font-medium text-default">
                {{ proteinSoFar }} / {{ FLOOR }} g
              </p>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-elevated">
              <div
                class="h-full rounded-full bg-secondary"
                :style="{ width: `${(proteinSoFar / FLOOR) * 100}%` }"
              />
            </div>
          </div>

          <ul role="list" class="divide-y divide-default">
            <li
              v-for="e in todayEntries"
              :key="e.name"
              class="flex items-center justify-between py-3"
            >
              <div>
                <p class="font-medium text-default">{{ e.name }}</p>
                <p class="text-sm text-muted">{{ e.detail }}</p>
              </div>
              <p class="text-sm text-muted">
                {{ e.kcal }} kcal · {{ e.protein }} g
              </p>
            </li>
          </ul>

          <p
            v-if="variant === 'A'"
            class="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning"
          >
            Cost of A: this button and the Foods row tap are two logging
            surfaces with different rules.
          </p>
        </section>

        <!-- ---------------------------------------------------- FOODS ----- -->
        <section v-else-if="screen === 'foods'" class="flex flex-col gap-4">
          <header class="flex items-center justify-between">
            <h1 class="text-2xl font-bold text-default">Foods</h1>
            <UButton v-if="isDesktop" icon="i-lucide-plus" color="primary">
              Add food
            </UButton>
          </header>

          <!-- A: the catalog is also the logging surface, ranked. -->
          <template v-if="variant === 'A'">
            <p class="text-xs font-medium tracking-wide text-dimmed uppercase">
              Frequent
            </p>
            <ul role="list" class="divide-y divide-default">
              <li v-for="f in top10" :key="f.id">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded-md py-3 text-left hover:bg-elevated"
                  @click="pick(f)"
                >
                  <span class="min-w-0">
                    <span class="flex items-center gap-2">
                      <span class="truncate font-medium text-default">{{
                        f.name
                      }}</span>
                      <UBadge
                        v-if="f.recipe"
                        color="primary"
                        variant="subtle"
                        size="sm"
                        >Recipe</UBadge
                      >
                    </span>
                    <span class="mt-0.5 block text-sm text-muted">
                      {{ f.kcal }} kcal · {{ f.protein }} g protein /100g
                    </span>
                  </span>
                  <span class="shrink-0 text-xs text-dimmed"
                    >{{ f.logs }}×</span
                  >
                </button>
              </li>
            </ul>
            <p class="text-xs font-medium tracking-wide text-dimmed uppercase">
              All foods
            </p>
            <ul role="list" class="divide-y divide-default">
              <li v-for="f in restByName" :key="f.id">
                <button
                  type="button"
                  class="w-full rounded-md py-3 text-left hover:bg-elevated"
                  @click="pick(f)"
                >
                  <span class="block truncate font-medium text-default">{{
                    f.name
                  }}</span>
                  <span class="mt-0.5 block text-sm text-muted">
                    {{ f.kcal }} kcal · {{ f.protein }} g protein /100g
                  </span>
                </button>
              </li>
            </ul>
          </template>

          <!-- B and C: a catalog, nothing more. Rows manage, they do not log. -->
          <template v-else>
            <p class="rounded-lg bg-elevated px-3 py-2 text-xs text-muted">
              In {{ variant }} this is a catalog only — add, edit, delete,
              recipes, reference-food matching. Logging happens
              {{ variant === 'B' ? 'on the Log tab' : 'from Today' }}.
            </p>
            <ul role="list" class="divide-y divide-default">
              <li
                v-for="f in byName"
                :key="f.id"
                class="flex items-center gap-1 py-3"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="truncate font-medium text-default">
                      {{ f.name }}
                    </p>
                    <UBadge
                      v-if="f.recipe"
                      color="primary"
                      variant="subtle"
                      size="sm"
                      >Recipe</UBadge
                    >
                  </div>
                  <p class="mt-0.5 text-sm text-muted">
                    {{ f.kcal }} kcal · {{ f.protein }} g protein /100g
                  </p>
                </div>
                <UButton
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  square
                  class="size-11 shrink-0 text-muted"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  square
                  class="size-11 shrink-0 text-muted"
                />
              </li>
            </ul>
          </template>
        </section>

        <!-- ------------------------------------------------------ LOG ----- -->
        <section v-else-if="screen === 'log'" class="flex flex-col gap-4">
          <header class="flex items-center justify-between">
            <h1 class="text-2xl font-bold text-default">Log</h1>
            <p class="text-sm text-muted">{{ remaining }} kcal left</p>
          </header>

          <UButton
            icon="i-lucide-pencil-line"
            color="neutral"
            variant="outline"
            block
          >
            Log an estimate instead
          </UButton>

          <p class="text-xs font-medium tracking-wide text-dimmed uppercase">
            Frequently logged
          </p>
          <ul role="list" class="grid grid-cols-2 gap-2">
            <li v-for="f in top10" :key="f.id">
              <button
                type="button"
                class="h-full w-full rounded-xl border border-default bg-default p-3 text-left hover:border-primary"
                @click="pick(f)"
              >
                <span class="flex items-center gap-1.5">
                  <span class="line-clamp-2 font-medium text-default">{{
                    f.name
                  }}</span>
                  <UIcon
                    v-if="f.recipe"
                    name="i-lucide-cooking-pot"
                    class="size-3.5 shrink-0 text-primary"
                  />
                </span>
                <span class="mt-1 block text-xs text-muted">
                  {{ f.kcal }} kcal · {{ f.protein }} g /100g
                </span>
              </button>
            </li>
          </ul>

          <p class="text-xs font-medium tracking-wide text-dimmed uppercase">
            All foods
          </p>
          <ul role="list" class="divide-y divide-default">
            <li v-for="f in restByName" :key="f.id">
              <button
                type="button"
                class="w-full rounded-md py-3 text-left hover:bg-elevated"
                @click="pick(f)"
              >
                <span class="block truncate font-medium text-default">{{
                  f.name
                }}</span>
                <span class="mt-0.5 block text-sm text-muted">
                  {{ f.kcal }} kcal · {{ f.protein }} g protein /100g
                </span>
              </button>
            </li>
          </ul>
        </section>

        <!-- --------------------------------------------------- REVIEW ----- -->
        <section v-else class="flex flex-col gap-4">
          <h1 class="text-2xl font-bold text-default">Review</h1>
          <p class="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">
            Unchanged by this prototype — here so the tab bar is real.
          </p>
        </section>
      </main>
    </div>

    <!-- ============================ bottom nav ============================ -->
    <nav
      class="fixed inset-x-0 bottom-0 z-40 flex lg:hidden border-t border-default bg-default pb-[env(safe-area-inset-bottom)]"
    >
      <button
        v-for="d in shell.primary"
        :key="d.key"
        type="button"
        class="flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors"
        :class="screen === d.key ? 'text-primary' : 'text-muted'"
        @click="screen = d.key"
      >
        <UIcon :name="d.icon" class="size-5" />
        {{ d.label }}
      </button>
      <button
        type="button"
        class="flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-muted"
        @click="moreOpen = true"
      >
        <UIcon name="i-lucide-menu" class="size-5" />
        More
      </button>
    </nav>

    <!-- Phone-only affordance in A and C; B logs from its own tab. -->
    <UButton
      v-if="!isDesktop && variant !== 'B'"
      icon="i-lucide-plus"
      color="primary"
      size="xl"
      aria-label="Log entry"
      class="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-lg"
      :ui="{ base: 'justify-center' }"
      @click="variant === 'C' ? (listSheetOpen = true) : (screen = 'foods')"
    />

    <!-- ============================== sheets ============================== -->
    <ResponsiveOverlay v-model:open="moreOpen" title="More">
      <ul role="list" class="divide-y divide-default">
        <li v-for="m in shell.more" :key="m">
          <button
            type="button"
            class="w-full py-3 text-left font-medium text-default"
          >
            {{ m }}
          </button>
        </li>
      </ul>
    </ResponsiveOverlay>

    <!-- C: the whole catalog inside Today's sheet. -->
    <ResponsiveOverlay v-model:open="listSheetOpen" title="Log entry">
      <div class="flex flex-col gap-3">
        <UButton
          icon="i-lucide-pencil-line"
          color="neutral"
          variant="outline"
          block
        >
          Log an estimate instead
        </UButton>
        <p class="text-xs font-medium tracking-wide text-dimmed uppercase">
          Frequent
        </p>
        <ul role="list" class="divide-y divide-default">
          <li v-for="f in top10" :key="f.id">
            <button
              type="button"
              class="w-full rounded-md py-3 text-left hover:bg-elevated"
              @click="pick(f)"
            >
              <span class="block truncate font-medium text-default">{{
                f.name
              }}</span>
              <span class="mt-0.5 block text-sm text-muted">
                {{ f.kcal }} kcal · {{ f.protein }} g protein /100g
              </span>
            </button>
          </li>
        </ul>
        <p class="text-xs font-medium tracking-wide text-dimmed uppercase">
          All foods
        </p>
        <ul role="list" class="divide-y divide-default">
          <li v-for="f in restByName" :key="f.id">
            <button
              type="button"
              class="w-full rounded-md py-3 text-left hover:bg-elevated"
              @click="pick(f)"
            >
              <span class="block truncate font-medium text-default">{{
                f.name
              }}</span>
              <span class="mt-0.5 block text-sm text-muted">
                {{ f.kcal }} kcal · {{ f.protein }} g protein /100g
              </span>
            </button>
          </li>
        </ul>
      </div>
    </ResponsiveOverlay>

    <!-- Grams — shared by all three, and it carries the Budget Projection gate
         the real /foods row tap skips today. -->
    <ResponsiveOverlay
      :open="sheetFood !== null"
      :title="`Log ${sheetFood?.name ?? ''}`"
      @update:open="(v: boolean) => !v && (sheetFood = null)"
    >
      <div class="flex flex-col gap-4">
        <UFormField label="Weight (g)" name="grams" required>
          <NumberField v-model="grams" :step="1" class="w-full" />
        </UFormField>
        <p v-if="projectedKcal" class="text-sm text-muted">
          {{ projectedKcal }} kcal · {{ remaining }} kcal left today
        </p>
        <UAlert
          v-if="warned && overBy > 0"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :title="`That would put you ${overBy} kcal over budget.`"
        />
        <UButton color="primary" block :disabled="!grams" @click="submitGrams">
          {{ warned && overBy > 0 ? 'Log anyway' : 'Log entry' }}
        </UButton>
      </div>
    </ResponsiveOverlay>
  </div>
</template>
