<script setup lang="ts">
import type { RingArc } from '~/utils/ring'

// Bound to a name rather than called bare: Stryker's instrumentation of a
// standalone `defineProps<…>()` statement leaves the macro uncompiled, and the
// whole component then fails to render under mutation testing.
const props = defineProps<{ arcs: RingArc[] }>()

// Tucker's ring geometry (DESIGN.md): 160x160 drawn in a 176 viewBox, rotated so
// every arc starts at 12 o'clock. Owned here rather than restated per component,
// which is what makes "the two rings are peers, drawn at the same geometry" true
// by construction: the Day Ring passes two arcs and the Goal ring one, and
// neither can size itself differently. The Check pair is deliberately not one of
// them — it draws its own smaller, equal-radius pair (ADR 0022).
const SIZE = 160
const VIEW_BOX = '0 0 176 176'
const CENTRE = 88
const STROKE_WIDTH = 15
</script>

<template>
  <div class="relative size-40 shrink-0">
    <!-- Decorative: the legend beside it is the accessible equivalent, and every
         arc's figure sits beside or inside it, so nothing is colour-alone. -->
    <svg
      class="-rotate-90"
      :width="SIZE"
      :height="SIZE"
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
          :stroke-width="STROKE_WIDTH"
        />
        <circle
          :cx="CENTRE"
          :cy="CENTRE"
          :r="arc.radius"
          fill="none"
          :stroke="arc.stroke"
          :stroke-width="STROKE_WIDTH"
          stroke-linecap="round"
          :stroke-dasharray="ringCircumference(arc.radius)"
          :stroke-dashoffset="
            ringDashOffset(arc.consumed, arc.target, arc.radius)
          "
        />
      </template>
    </svg>
    <div class="absolute inset-0 grid place-content-center text-center">
      <slot />
    </div>
  </div>
</template>
