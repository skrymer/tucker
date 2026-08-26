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

// The browser/PWA chrome (status + address bar) tracks the active mode (DESIGN.md
// → Dark mode) via a single reactive `theme-color`. `colorMode.value` resolves
// 'system' to the real OS scheme and updates when the OS flips, so this one meta
// covers light, dark, System, and a *pinned* mode (Dark on a light-OS device)
// alike. A static media pair is deliberately avoided — it shares the meta name,
// so Unhead would dedupe the two and the reactive value would clobber it.
const colorMode = useColorMode()
useHead({
  meta: [
    {
      name: 'theme-color',
      content: computed(() =>
        colorMode.value === 'dark' ? '#0f1a15' : '#eff6f1',
      ),
    },
  ],
})

// The toast viewport is portalled into a wrapper of Tucker's own, so that the
// wrapper can carry `aria-live`: an open sheet would otherwise leave every toast
// out of the accessibility tree, and Reka's own announcement is inert. Why, and
// why it can't live on `body` directly: ADR 0005, "How a toast reaches a screen
// reader".
const TOAST_PORTAL = 'tucker-toasts'

const toaster = computed(() => ({
  max: 1,
  portal: `#${TOAST_PORTAL}`,
  position: isDesktop.value
    ? ('bottom-right' as const)
    : ('top-center' as const),
  ui: {
    viewport: isDesktop.value
      ? 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'
      : 'top-[calc(1rem+env(safe-area-inset-top))]',
  },
}))

/**
 * How the wrapper announces the toast in it. See ADR 0005, "How a toast reaches
 * a screen reader", for why Tucker announces toasts at all and why the wrapper
 * cannot be `body` itself.
 */
function useToastAnnouncement() {
  const { toasts } = useToast()

  // `max` is 1, so the toast in the wrapper is the newest one — and `off` when
  // there is none, since a sweep that finds no attribute at all is the thing
  // this exists to survive. An omitted `type` is `foreground`, Reka's own
  // default, so only an explicit `background` is polite: ADR 0005 makes every
  // failure foreground (it interrupts) and the one kept success background.
  const politeness = computed(() => {
    const current = toasts.value.at(-1)
    if (!current) return 'off'
    return current.type === 'background' ? 'polite' : 'assertive'
  })

  return { politeness }
}

const { politeness } = useToastAnnouncement()
</script>

<template>
  <!--
    Teleported to `body`, where Nuxt UI would have put the viewport anyway.
    Left inside `#__nuxt` it renders identically and paints *under* the open
    sheet's dim overlay, which then swallows the toast's own Retry click.
  -->
  <Teleport to="body">
    <div :id="TOAST_PORTAL" :aria-live="politeness"></div>
  </Teleport>
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
