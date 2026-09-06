<script setup lang="ts">
import { isDestinationActive, type NavDestination } from '~/utils/navigation'

// One nav destination rendered as a link. Owns the active-route wiring once so
// the side nav and the bottom tab bar don't each repeat it: NuxtLink marks
// itself current only on an exact match, so we drive aria-current ourselves from
// the segment-aware matcher (via the `custom` slot) — that keeps a destination
// active across its nested children (e.g. Profile on /profile/weight). The
// caller passes the per-nav anchor/icon classes.
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{
  destination: NavDestination
  anchorClass: string
  iconClass: string
}>()

/**
 * Chosen — this destination was actually followed. Emitted here rather than
 * listened for on the anchor from outside: this component's root is a `NuxtLink`
 * in `custom` mode, which renders a fragment, so a listener passed in inherits
 * onto nothing and a caller ends up watching the row instead — where a click in
 * the padding looks the same as a click on the link.
 */
const emit = defineEmits<{ chosen: [] }>()

/**
 * Whether the router will actually navigate for this click, matching what
 * `vue-router` itself declines: a modified or non-primary click is the browser's
 * to handle (a new tab), and the page it was made from does not change.
 */
function navigates(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  )
}

const route = useRoute()
</script>

<template>
  <NuxtLink :to="destination.to" custom>
    <template #default="{ href, navigate }">
      <a
        :href="href"
        :class="anchorClass"
        :aria-current="
          isDestinationActive(destination.to, route.path) ? 'page' : undefined
        "
        @click="
          (event: MouseEvent) => {
            const followed = navigates(event)
            navigate(event)
            if (followed) emit('chosen')
          }
        "
      >
        <UIcon :name="destination.icon" :class="iconClass" />
        <span>{{ destination.label }}</span>
      </a>
    </template>
  </NuxtLink>
</template>
