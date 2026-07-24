<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

// The appearance preference, bound to @nuxtjs/color-mode's cookie-backed value
// (per-device; theme is presentation the backend never acts on — DESIGN.md →
// Dark mode). Each option pairs an icon with a text label so colour is never the
// only signal (DESIGN.md guardrail). Values match color-mode's union exactly:
// 'light' | 'dark' | 'system'; 'system' follows the OS's prefers-color-scheme.
const colorMode = useColorMode()
const items: TabsItem[] = [
  { label: 'Light', icon: 'i-lucide-sun', value: 'light' },
  { label: 'Dark', icon: 'i-lucide-moon', value: 'dark' },
  { label: 'System', icon: 'i-lucide-monitor', value: 'system' },
]
</script>

<template>
  <UTabs
    v-model="colorMode.preference"
    :items="items"
    :content="false"
    variant="pill"
    color="primary"
    aria-label="Appearance"
  />
</template>
