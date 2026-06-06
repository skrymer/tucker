<script setup lang="ts">
// The platform-aware install affordance: a one-tap install button where the
// browser supports it (Android/desktop Chromium), Share-sheet instructions on
// iOS Safari, and nothing once installed. All branching lives in usePwaInstall.
const { canInstall, iosInstructions, promptInstall } = usePwaInstall()
</script>

<template>
  <UButton
    v-if="canInstall"
    icon="i-lucide-download"
    label="Install Tucker"
    color="primary"
    @click="promptInstall"
  />

  <!-- iOS Safari has no programmatic install — guide the manual Share flow. -->
  <UAlert
    v-else-if="iosInstructions"
    icon="i-lucide-share"
    color="neutral"
    variant="subtle"
    title="Install Tucker"
    description='Tap the Share button, then "Add to Home Screen".'
  />
</template>
