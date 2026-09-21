<script setup lang="ts">
import type { RingArc } from '~/utils/ring'

// Bound to a name rather than called bare: Stryker's instrumentation of a
// standalone `defineProps<…>()` statement leaves the macro uncompiled, and the
// whole component then fails to render under mutation testing.
const props = defineProps<{ arcs: RingArc[] }>()

// The geometry lives in `app/utils/ring.ts`, shared so that neither ring can size
// itself differently. Rotated -90° so every arc starts at 12 o'clock.
const VIEW_BOX = `0 0 ${RING_VIEW_BOX_UNITS} ${RING_VIEW_BOX_UNITS}`
const CENTRE = RING_VIEW_BOX_UNITS / 2
const gaugeBox = { width: `${RING_SIZE_REM}rem`, height: `${RING_SIZE_REM}rem` }
</script>

<template>
  <div class="relative shrink-0" :style="gaugeBox">
    <!-- Decorative: the legend beside it is the accessible equivalent, and every
         arc's figure sits beside or inside it, so nothing is colour-alone. -->
    <svg
      class="-rotate-90"
      width="100%"
      height="100%"
      :viewBox="VIEW_BOX"
      aria-hidden="true"
    >
      <template v-for="arc in props.arcs" :key="arc.radius">
        <circle
          :cx="CENTRE"
          :cy="CENTRE"
          :r="arc.radius"
          fill="none"
          :stroke="ringTrack(arc.stroke)"
          :stroke-width="RING_STROKE_WIDTH"
        />
        <circle
          :cx="CENTRE"
          :cy="CENTRE"
          :r="arc.radius"
          fill="none"
          :stroke="arc.stroke"
          :stroke-width="RING_STROKE_WIDTH"
          stroke-linecap="round"
          :stroke-dasharray="ringCircumference(arc.radius)"
          :stroke-dashoffset="
            ringDashOffset(arc.consumed, arc.target, arc.radius)
          "
        />
      </template>
    </svg>
    <!-- Centred on the gauge, and so on the hole. Nothing clamps the figure's
         width: the ring is sized so that a four-digit one clears the arcs. -->
    <div class="absolute inset-0 grid place-content-center text-center">
      <slot />
    </div>
  </div>
</template>
