<template>
  <!--
    Lift the toast viewport above the phone bottom tab bar so toasts never
    overlap it. `lg:bottom-4` restores the default once the side nav takes
    over and there's no bottom bar to clear.
  -->
  <UApp :toaster="{ ui: { viewport: 'bottom-20 lg:bottom-4' } }">
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
