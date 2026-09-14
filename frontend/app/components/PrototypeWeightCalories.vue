<script setup lang="ts">
/**
 * PROTOTYPE — throwaway. Delete this file, its NOTES.md, and the two marked
 * blocks in `pages/review.vue` once the question is answered.
 *
 * ROUND 3. Rounds 1 and 2 settled the Calorie-Tracking-ON chart and are now held
 * fixed: daily intake bars, the Calorie Budget as a step line, over-budget bars
 * in error red, raw Weight Measurements as dots, an unlogged day as a baseline
 * tick with the Budget line spanning it. Flip `tracking` in the header to see it.
 *
 * QUESTION: what does this section do for a WEIGHT-ONLY user (Calorie Tracking
 * off, F12 / ADR 0024)? Gate it off like the Intake Breakdown and the
 * Micronutrient Intake do — or degrade to the weight half, which is complete and
 * correct on its own and is the only chart of their own body they would have?
 *
 *   A — Not rendered          gated off, consistent with every other calorie surface
 *   B — Weight alone          dots + Trend Weight, single axis
 *   C — + Goal target line    a horizontal line at the Goal's target weight
 *   D — + planned trajectory  the sloped line from the Goal's start at its rate
 *
 * The `goal` / `maintenance` toggle matters: in MAINTENANCE MODE there is
 * deliberately nothing to draw a reference against — ADR 0008 rules a defended
 * target weight and guard band out of scope — so C and D collapse to B there by
 * decision, not by omission.
 *
 * Switch with ?variant=A..D, the top bar, or the left/right arrow keys.
 * JUDGE IT AT 412px FIRST. Stub data only: no API call, no mutation, no test.
 */

const VARIANTS = [
  { key: 'A', name: 'Not rendered' },
  { key: 'B', name: 'Weight alone' },
  { key: 'C', name: '+ Goal target line' },
  { key: 'D', name: '+ planned trajectory' },
] as const
type VariantKey = (typeof VARIANTS)[number]['key']

const route = useRoute()
const router = useRouter()

const variant = computed<VariantKey>(() => {
  const found = VARIANTS.find((v) => v.key === route.query.variant)
  return found ? found.key : 'B'
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
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  )
    return
  if (e.key === 'ArrowLeft') cycle(-1)
  if (e.key === 'ArrowRight') cycle(1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// ------------------------------------------------------------- the two settings

const tracking = ref(false)
const hasGoal = ref(true)

/** Goal elements only exist with a Goal; Maintenance Mode has no target (ADR 0008). */
const showTarget = computed(
  () => !tracking.value && hasGoal.value && variant.value === 'C',
)
const showPlan = computed(
  () => !tracking.value && hasGoal.value && variant.value === 'D',
)

// ------------------------------------------------------------- stub data

interface Day {
  i: number
  date: string
  kcal: number | null
  rawKg: number | null
  trendKg: number
  budget: number
}

function lcg(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

const ALL: Day[] = (() => {
  const r = lcg(20260914)
  const days: Day[] = []
  const start = new Date(Date.UTC(2026, 5, 17))
  let trend = 0
  let seeded = false
  for (let i = 0; i < 90; i++) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)

    const base = i <= 60 ? 82.5 - (3.0 * i) / 60 : 79.5 + (r() - 0.5) * 0.15
    const missedWeighIn = i % 37 === 11
    const rawKg = missedWeighIn ? null : +(base + (r() - 0.5) * 0.9).toFixed(1)
    if (rawKg !== null) {
      trend = seeded ? trend + 0.1 * (rawKg - trend) : rawKg
      seeded = true
    }

    const budget = i < 30 ? 1900 : i < 62 ? 1850 : 1800
    const weekend = i % 7 === 5 || i % 7 === 6
    const unlogged =
      i % 19 === 5 || (i >= 70 && i <= 72) || (i >= 40 && i <= 41)
    const kcal = unlogged
      ? null
      : Math.round(
          i >= 62
            ? budget - 220 + (r() - 0.5) * 300
            : budget - 150 + (r() - 0.5) * 360 + (weekend ? 420 : 0),
        )

    days.push({
      i,
      date: d.toISOString().slice(0, 10),
      kcal,
      rawKg,
      trendKg: +trend.toFixed(2),
      budget,
    })
  }
  return days
})()

/**
 * The active Goal. `startKg` is the Trend Weight at the moment it was set
 * (ADR 0016), so the planned line and the actual trend share an origin. The stub
 * is deliberately BEHIND plan: the trend fell at ~0.35 kg/week and then stalled,
 * against a chosen 0.50.
 */
const GOAL = { startI: 0, startKg: 82.5, targetKg: 75.0, ratePerWeek: 0.5 }
const plannedAt = (i: number) =>
  GOAL.startKg - (GOAL.ratePerWeek * (i - GOAL.startI)) / 7

const WINDOWS = [28, 90] as const
const windowDays = ref<28 | 90>(28)
const days = computed(() => ALL.slice(-windowDays.value))

const loggedDays = computed(
  () => days.value.filter((d) => d.kcal !== null).length,
)
const weighedDays = computed(
  () => days.value.filter((d) => d.rawKg !== null).length,
)

// ------------------------------------------------------------- geometry

const host = ref<HTMLElement | null>(null)
const width = ref(700)
onMounted(() => {
  if (!host.value) return
  const ro = new ResizeObserver(([e]) => {
    if (e) width.value = Math.round(e.contentRect.width)
  })
  ro.observe(host.value)
  onBeforeUnmount(() => ro.disconnect())
})

const PAD = { top: 10, right: 40, bottom: 20, left: 38 }
const HEIGHT = 200
const box = computed(() => ({
  top: PAD.top,
  bottom: HEIGHT - PAD.bottom,
  // With tracking off there is no calorie axis, so the plot reclaims that gutter.
  left: tracking.value ? PAD.left : 12,
  right: width.value - PAD.right,
}))

const n = computed(() => days.value.length)
const band = computed(() => (box.value.right - box.value.left) / n.value)
const xAt = (i: number) => box.value.left + (i + 0.5) * band.value

const kcalTop = computed(
  () =>
    Math.max(...days.value.map((d) => Math.max(d.kcal ?? 0, d.budget))) * 1.14,
)
const yKcal = (v: number) =>
  box.value.bottom - (v / kcalTop.value) * (box.value.bottom - box.value.top)

/**
 * The weight domain. Note what including the TARGET does: it is metres away from
 * a 28-day window's own range, so the actual trend compresses into a sliver.
 * That cost is the point of variant C and is left visible rather than tuned away.
 */
const kgDomain = computed(() => {
  const vals = days.value.flatMap((d) => [
    d.trendKg,
    ...(d.rawKg !== null ? [d.rawKg] : []),
  ])
  if (showTarget.value) vals.push(GOAL.targetKg)
  if (showPlan.value) {
    vals.push(plannedAt(days.value[0]!.i), plannedAt(days.value.at(-1)!.i))
  }
  return [Math.min(...vals) - 0.4, Math.max(...vals) + 0.4] as [number, number]
})
const yKg = (v: number) => {
  const [lo, hi] = kgDomain.value
  return (
    box.value.bottom -
    ((v - lo) / (hi - lo)) * (box.value.bottom - box.value.top)
  )
}

const barW = computed(() => Math.max(1.2, band.value * 0.74))

const bars = computed(() =>
  days.value
    .map((d, idx) => ({ d, idx }))
    .filter(({ d }) => d.kcal !== null)
    .map(({ d, idx }) => ({
      x: xAt(idx) - barW.value / 2,
      w: barW.value,
      y: yKcal(d.kcal!),
      h: box.value.bottom - yKcal(d.kcal!),
      over: d.kcal! > d.budget,
    })),
)

/** Round 2's answer: an unlogged day is a baseline tick. */
const gapTicks = computed(() =>
  days.value
    .map((d, idx) => ({ d, idx }))
    .filter(({ d }) => d.kcal === null)
    .map(({ idx }) => ({ x: xAt(idx) - barW.value / 2, w: barW.value })),
)

/** Round 2's answer: the Budget line spans an unlogged day. */
const budgetPath = computed(() =>
  days.value
    .map((d, idx) => {
      const y = yKcal(d.budget)
      return `${xAt(idx) - band.value / 2},${y} ${xAt(idx) + band.value / 2},${y}`
    })
    .join(' '),
)

const trendPath = computed(() =>
  days.value.map((d, idx) => `${xAt(idx)},${yKg(d.trendKg)}`).join(' '),
)

const plannedPath = computed(() =>
  days.value.map((d, idx) => `${xAt(idx)},${yKg(plannedAt(d.i))}`).join(' '),
)

const dots = computed(() =>
  days.value
    .map((d, idx) => ({ d, idx }))
    .filter(({ d }) => d.rawKg !== null)
    .map(({ d, idx }) => ({ cx: xAt(idx), cy: yKg(d.rawKg!) })),
)

const xTicks = computed(() => {
  const step = Math.ceil(n.value / 5)
  return days.value
    .map((d, idx) => ({ d, idx }))
    .filter(({ idx }) => idx % step === 0)
    .map(({ d, idx }) => ({ x: xAt(idx), label: d.date.slice(5) }))
})

// ------------------------------------------------------------- hover readout

const hover = ref<number | null>(null)
function onMove(e: PointerEvent) {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
  const idx = Math.floor((e.clientX - rect.left - box.value.left) / band.value)
  hover.value = idx >= 0 && idx < n.value ? idx : null
}
const hovered = computed(() =>
  hover.value === null ? null : days.value[hover.value]!,
)

const caption = computed(() =>
  tracking.value
    ? `${loggedDays.value} of ${windowDays.value} days logged`
    : `${weighedDays.value} of ${windowDays.value} days weighed`,
)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-semibold text-highlighted">
          {{ tracking ? 'Weight & calories' : 'Your weight' }}
          <span class="ml-1 text-xs font-normal text-warning">PROTOTYPE</span>
        </h2>
        <div class="flex items-center gap-1">
          <UButton
            size="xs"
            :variant="tracking ? 'solid' : 'ghost'"
            color="neutral"
            @click="tracking = !tracking"
          >
            tracking {{ tracking ? 'on' : 'off' }}
          </UButton>
          <UButton
            v-if="!tracking"
            size="xs"
            :variant="hasGoal ? 'solid' : 'ghost'"
            color="neutral"
            @click="hasGoal = !hasGoal"
          >
            {{ hasGoal ? 'goal' : 'maintenance' }}
          </UButton>
          <span class="w-2" />
          <UButton
            v-for="w in WINDOWS"
            :key="w"
            size="xs"
            :variant="windowDays === w ? 'solid' : 'ghost'"
            color="neutral"
            @click="windowDays = w"
          >
            {{ w }}d
          </UButton>
        </div>
      </div>
    </template>

    <!-- The measured host stays mounted in every variant. Putting `ref="host"`
         on a v-else branch meant mounting on variant A left the ResizeObserver
         with nothing to observe, so `width` kept its 700 default and every later
         variant drew a mis-scaled SVG. -->
    <div ref="host" class="w-full">
      <!-- Variant A: the section is gated off entirely. Shown as a note so the
           cost of choosing it is visible rather than being a blank screen. -->
      <p
        v-if="!tracking && variant === 'A'"
        class="py-6 text-center text-sm text-muted"
      >
        Nothing renders here. A weight-only user's <code>/review</code> is the
        Goal hero and the ledger — no chart of their own body anywhere in
        Tucker.
      </p>

      <template v-else>
        <svg
          :viewBox="`0 0 ${width} ${HEIGHT}`"
          :height="HEIGHT"
          class="w-full touch-none select-none"
          @pointermove="onMove"
          @pointerleave="hover = null"
        >
          <line
            :x1="box.left"
            :x2="box.right"
            :y1="box.bottom"
            :y2="box.bottom"
            stroke="var(--ui-border)"
          />

          <template v-if="tracking">
            <rect
              v-for="(g, i) in gapTicks"
              :key="`g${i}`"
              :x="g.x"
              :y="box.bottom - 3"
              :width="g.w"
              height="3"
              fill="var(--ui-text-dimmed)"
              opacity="0.8"
            />
            <rect
              v-for="(b, i) in bars"
              :key="`b${i}`"
              :x="b.x"
              :y="b.y"
              :width="b.w"
              :height="Math.max(0, b.h)"
              rx="1"
              :fill="b.over ? 'var(--ui-error)' : 'var(--ui-text-dimmed)'"
              :opacity="b.over ? 0.9 : 0.38"
            />
            <polyline
              :points="budgetPath"
              fill="none"
              stroke="var(--ui-secondary)"
              stroke-width="1.5"
              stroke-dasharray="4 3"
            />
          </template>

          <!-- Goal target: a horizontal line at the target weight -->
          <template v-if="showTarget">
            <line
              :x1="box.left"
              :x2="box.right"
              :y1="yKg(GOAL.targetKg)"
              :y2="yKg(GOAL.targetKg)"
              stroke="var(--ui-secondary)"
              stroke-width="1.5"
              stroke-dasharray="4 3"
            />
            <text
              :x="box.right"
              :y="yKg(GOAL.targetKg) - 4"
              text-anchor="end"
              class="fill-current text-muted"
              style="font-size: 9px"
            >
              target {{ GOAL.targetKg.toFixed(1) }} kg
            </text>
          </template>

          <!-- Goal plan: the sloped trajectory from the Goal's start at its rate -->
          <polyline
            v-if="showPlan"
            :points="plannedPath"
            fill="none"
            stroke="var(--ui-secondary)"
            stroke-width="1.5"
            stroke-dasharray="4 3"
          />

          <circle
            v-for="(p, i) in dots"
            :key="`d${i}`"
            :cx="p.cx"
            :cy="p.cy"
            r="2.1"
            fill="var(--ui-primary)"
            opacity="0.65"
          />

          <polyline
            :points="trendPath"
            fill="none"
            stroke="var(--ui-primary)"
            stroke-width="2.25"
            stroke-linejoin="round"
          />

          <g class="fill-current text-muted" style="font-size: 9px">
            <template v-if="tracking">
              <text :x="box.left - 4" :y="box.top + 8" text-anchor="end">
                {{ Math.round(kcalTop) }}
              </text>
              <text :x="box.left - 4" :y="box.bottom" text-anchor="end">0</text>
            </template>
            <text :x="box.right + 4" :y="yKg(kgDomain[1]) + 8">
              {{ kgDomain[1].toFixed(1) }}
            </text>
            <text :x="box.right + 4" :y="yKg(kgDomain[0])">
              {{ kgDomain[0].toFixed(1) }}
            </text>
            <text
              v-for="t in xTicks"
              :key="t.label"
              :x="t.x"
              :y="HEIGHT - 6"
              text-anchor="middle"
            >
              {{ t.label }}
            </text>
          </g>

          <line
            v-if="hover !== null"
            :x1="xAt(hover)"
            :x2="xAt(hover)"
            :y1="PAD.top"
            :y2="HEIGHT - PAD.bottom"
            stroke="var(--ui-border-accented)"
          />
        </svg>

        <p class="h-5 text-xs tabular-nums text-muted">
          <template v-if="hovered">
            {{ hovered.date }} ·
            <template v-if="tracking">
              {{
                hovered.kcal === null ? 'not logged' : `${hovered.kcal} kcal`
              }}
              · budget {{ hovered.budget }} ·
            </template>
            {{ hovered.rawKg === null ? 'no weigh-in' : `${hovered.rawKg} kg` }}
            · trend {{ hovered.trendKg.toFixed(2) }} kg
          </template>
        </p>
        <p class="text-xs text-dimmed">{{ caption }}</p>
      </template>
    </div>
  </UCard>

  <!-- Switcher: obviously not part of the design under evaluation. -->
  <div
    class="fixed top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-inverted px-2 py-1 text-inverted shadow-lg"
  >
    <UButton
      icon="i-lucide-chevron-left"
      size="xs"
      color="neutral"
      variant="ghost"
      aria-label="Previous variant"
      @click="cycle(-1)"
    />
    <span class="px-1 text-xs font-medium whitespace-nowrap">
      {{ variant }} — {{ variantName }}
    </span>
    <UButton
      icon="i-lucide-chevron-right"
      size="xs"
      color="neutral"
      variant="ghost"
      aria-label="Next variant"
      @click="cycle(1)"
    />
  </div>
</template>
