<template>
  <!--
    Lift the toast viewport above the phone bottom tab bar so toasts never
    overlap it, and add `env(safe-area-inset-bottom)` so a now-persistent error
    toast clears the iPhone home indicator (relies on `viewport-fit=cover`).
    `lg:bottom-4` restores the default once the side nav takes over.

    `max: 1` caps concurrent toasts at one (ADR 0005): the bottom slot never
    stacks into the phone nav or the /foods FAB.
  -->
  <UApp
    :toaster="{
      max: 1,
      ui: {
        viewport:
          'bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]',
      },
    }"
  >
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
