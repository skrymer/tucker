<script setup lang="ts">
// Toast positioning is a responsive split — the same phone-vs-desktop rule the
// rest of the app follows (ADR 0005). On a phone the whole bottom belt is taken
// by the open sheet's inputs and submit button, the FAB/tab bar, and — whenever
// a field is focused — the software keyboard; a bottom toast lands right on the
// input the user is filling. So phone toasts drop from the top (matching the
// iOS system-notification convention users already read as "a notification"),
// while desktop keeps the conventional bottom-right, where nothing competes for
// the corner and there is no keyboard to dodge.
//
// Binding `position` reactively (rather than hand-overriding viewport classes)
// lets Nuxt UI's theme wire up each toast's anchor AND its slide-in direction
// for the chosen edge — overriding only the viewport would leave the toast body
// still anchored to the opposite edge. We nudge just the inset so a phone toast
// clears the notch (safe-area-inset-top) and a desktop one the home indicator
// (safe-area-inset-bottom); `viewport-fit=cover` (nuxt.config.ts) makes those
// env() insets resolve to real values.
//
// `max: 1` caps concurrent toasts at one (ADR 0005) so the slot never stacks.
const isDesktop = useIsDesktop()

const toaster = computed(() => ({
  max: 1,
  position: (isDesktop.value ? 'bottom-right' : 'top-center') as const,
  ui: {
    viewport: isDesktop.value
      ? 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'
      : 'top-[calc(1rem+env(safe-area-inset-top))]',
  },
}))
</script>

<template>
  <UApp :toaster="toaster">
    <!--
      @vite-pwa/nuxt does not inject the manifest link on its own — this
      component emits it, with crossorigin from `pwa.useCredentials` (see
      nuxt.config.ts).
    -->
    <NuxtPwaManifest />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
