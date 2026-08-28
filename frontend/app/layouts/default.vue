<script setup lang="ts">
// A single, shell-level interstitial (DESIGN.md "Feedback states") rather than
// duplicating it per-widget: once the session is gone every fetch fails
// identically, so one clear message beats six identical "Retry" cards.

/**
 * Whether the interstitial may replace the shell. `isSignedOut` says the session
 * is gone from the instant the redirect is seen, which `useApiMutation` needs
 * that early; this says it is safe to act on.
 *
 * Safe means the layout's `<Suspense>` boundary has resolved. `markSignedOut()`
 * fires from the `/api` response hook (app/plugins/auth-gate.client.ts), and on
 * a signed-out load the read that meets Access's redirect is the one `AppNav`
 * suspends on — so dropping the branch there unmounts a component whose setup
 * has not resolved. Vue defers `isUnmounted` into `suspense.effects`, so it
 * resolves anyway and inserts into a parent that is gone, blanking the app. A
 * mounted hook is queued into those same effects and flushed only by
 * `resolve()`, so it reads "every dep of this boundary has landed" — `nextTick`
 * does not, it flushes the job queue instead.
 *
 * It follows that a dep which never settles would hold the interstitial back
 * too. None can today: an opaque redirect resolves rather than rejects, and both
 * awaits under this boundary capture rather than throw — `useOptionalFetch` in
 * `AppNav`, and `useApi`'s `{ data, error }` in every page.
 */
function useSignedOutInterstitial() {
  const { isSignedOut } = useAuthGate()
  const shellMounted = ref(false)
  onMounted(() => {
    shellMounted.value = true
  })

  return {
    // `isSignedOut` first: it short-circuits while signed in, so `shellMounted`
    // gains no subscriber on that path and its write schedules no render.
    showsSignedOut: computed(() => isSignedOut.value && shellMounted.value),
  }
}

const { showsSignedOut } = useSignedOutInterstitial()
</script>

<template>
  <div class="app-canvas min-h-dvh">
    <SignedOutState v-if="showsSignedOut" />
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
