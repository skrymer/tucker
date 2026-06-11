<script setup lang="ts">
import { isDestinationActive, type NavDestination } from '~/utils/navigation'

// One nav destination rendered as a link. Owns the active-route wiring once so
// the side nav and the bottom tab bar don't each repeat it: NuxtLink marks
// itself current only on an exact match, so we drive aria-current ourselves from
// the segment-aware matcher (via the `custom` slot) — that keeps a destination
// active across its nested children (e.g. Profile on /profile/weight). The
// caller passes the per-nav anchor/icon classes.
defineProps<{
  destination: NavDestination
  anchorClass: string
  iconClass: string
}>()

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
        @click="navigate"
      >
        <UIcon :name="destination.icon" :class="iconClass" />
        <span>{{ destination.label }}</span>
      </a>
    </template>
  </NuxtLink>
</template>
