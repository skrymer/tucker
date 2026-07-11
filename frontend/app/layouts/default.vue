<script setup lang="ts">
// A single, shell-level interstitial (DESIGN.md "Feedback states") rather than
// duplicating it per-widget: once the session is gone every fetch fails
// identically, so one clear message beats six identical "Retry" cards.
const { isLoggedOut } = useAuthGate()
</script>

<template>
  <div class="app-canvas min-h-dvh">
    <LoggedOutState v-if="isLoggedOut" />
    <template v-else>
      <AppNav />
      <div class="lg:pl-60">
        <main class="mx-auto w-full max-w-2xl p-4 pb-24 lg:p-6 lg:pb-10">
          <slot />
        </main>
      </div>
    </template>
  </div>
</template>
