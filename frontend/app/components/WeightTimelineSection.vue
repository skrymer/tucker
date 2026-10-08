<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { components } from '#open-fetch-schemas/api'

const props = defineProps<{
  timeline: components['schemas']['WeightTimelineResponse']
  /** Whether a wider (or narrower) window is on its way. */
  pending?: boolean
}>()

/**
 * How wide a window is being asked about. Owned by the page, which turns it into
 * the request; the section only offers the choice.
 */
// Stryker disable next-line all: a compiler macro's arguments are hoisted out of setup()
const windowDays = defineModel<TimelineWindow>('windowDays', { default: 28 })

const windowItems: TabsItem[] = TIMELINE_WINDOWS.map((days) => ({
  label: `${days} days`,
  value: days,
}))

/**
 * How the chart reads a day, and the two things it can be read against — the
 * intake half's scale, or the Goal's plan. Never both: the plan takes the intake
 * half's place rather than joining it (ADR 0029), so exactly one of them decides
 * the domain, and each is one object so a series and the axis it is placed
 * against cannot be derived apart.
 */
const scale = computed(() => weightTimelineScale(props.timeline))
const plan = computed(() => weightTimelineTrajectory(props.timeline))
/** Whether the plan runs past an edge of the plot, which changes what the key says. */
const planClipped = computed(() => (plan.value?.clips.length ?? 0) > 0)

/**
 * What to say when a plan is what this timeline draws and none of it is drawable.
 * Null whenever there is nothing to explain — the plan is on the chart, or there
 * is no plan because the User is in Maintenance Mode.
 *
 * Without it the two are the same card: every `trajectoryKg` is null either way,
 * and the key chip, the line and the readout all go with nothing saying why
 * (ADR 0029). `planStartsOn` is the response saying a plan is its evidence even
 * when no day carries one, which is what tells the states apart.
 */
const planPending = computed(() => {
  const evidence = props.timeline.evidence
  if (plan.value || evidence?.kind !== 'PLAN' || !evidence.planStartsOn) {
    return null
  }
  // Two silences, two sentences. A plan still ahead of the window has a date
  // worth naming; a plan that began *within* it has too few days to draw a line
  // through — the common case, since a Goal is always started today (ADR 0016)
  // and the window ends today. Dating that one prints today in the future tense.
  return evidence.planStartsOn > props.timeline.to
    ? `Your goal’s plan starts ${formatDayMonthFromISO(evidence.planStartsOn)}.`
    : 'Your goal’s plan appears here from tomorrow.'
})

/** Whether there is an intake half at all, which is Calorie Tracking's to decide. */
const tracksIntake = computed(() => timelineTracksIntake(props.timeline))

/** How far the bars can be trusted: how many of the days drawn carry an Entry. */
const coverage = computed(() => {
  const evidence = props.timeline.evidence
  if (evidence?.kind !== 'INTAKE' || evidence.loggedDays == null) return null
  return loggedDaysCaption(
    evidence.loggedDays,
    props.timeline.from,
    props.timeline.to,
  )
})

/** Each day in words — the chart is decorative, so this is what states it. */
const readouts = computed(() => weightTimelineReadouts(props.timeline))

/**
 * The day under the pointer, read out beneath the chart.
 *
 * Sticky on purpose: it holds the last day rather than clearing, so a tap on a
 * phone — which has no hover to leave — leaves something to read. Held as a
 * *date* and looked up again, so a window that no longer draws that day drops
 * the readout rather than naming one the chart has left behind.
 */
function useFocus() {
  const focusedDate = ref<string | null>(null)
  const readout = computed(
    () =>
      readouts.value.find((line) => line.date === focusedDate.value)?.text ??
      '',
  )
  return { focusedDate, readout }
}
const { focusedDate, readout } = useFocus()
</script>

<template>
  <UCard
    role="region"
    aria-labelledby="weight-timeline-heading"
    :aria-busy="pending"
  >
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 id="weight-timeline-heading" class="text-sm font-medium text-muted">
        Your weight
      </h2>
      <SectionTabs v-model="windowDays" :items="windowItems" label="Window" />
    </div>

    <!-- Kept and dimmed while a wider window loads, the move and the reasoning
         IntakeBreakdownSection's own wrapper carries (ADR 0007). -->
    <div
      class="mt-3 transition-opacity delay-150"
      :class="pending && 'opacity-50'"
    >
      <WeightTimelineChart
        :timeline="timeline"
        :scale="scale"
        :plan="plan"
        @focus="focusedDate = $event"
      />

      <div
        class="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted"
      >
        <WeightTimelineKey
          :plan="plan !== null"
          :plan-clipped="planClipped"
          :tracks-intake="tracksIntake"
        />

        <span v-if="coverage">{{ coverage }}</span>
        <!-- Said in the key's own row rather than over the chart: the chart is
             correct and simply has nothing of the plan to show yet, so this
             belongs beside the strokes it names and not as an error. -->
        <span v-if="planPending">{{ planPending }}</span>
      </div>

      <!-- An `output`, the result of asking rather than another line of prose —
           but not a live region: the chart is `aria-hidden`, so only a pointer
           reaches this, and every line it can produce is in the list below.
           (frontend/DESIGN.md — the ring's readout is decorative for the same
           reason.) -->
      <output aria-live="off" class="block h-5 text-xs tabular-nums text-muted">
        {{ readout }}
      </output>

      <!-- Where the chart's figures are readable: one line per day, the same
           words the readout puts under the pointer. -->
      <ul class="sr-only">
        <li v-for="line in readouts" :key="line.date">{{ line.text }}</li>
      </ul>
    </div>
  </UCard>
</template>
