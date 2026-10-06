import type { Ref } from 'vue'

/**
 * How a surface presents its barcode scanner (ADR 0006): fullscreen on a
 * phone, inline on desktop. The choice holds while the scanner is open: true
 * fullscreen can itself widen a window past the breakpoint.
 */
export function useFullscreenScanner(scanner: {
  open: Readonly<Ref<boolean>>
  start: () => void
  stop: () => void
}) {
  const isDesktop = useIsDesktop()
  // Captured as the scanner opens — on the flush, not at the call, because a
  // surface can open it in the very tick the breakpoint is first read.
  const held = ref<boolean | null>(null)
  watch(
    scanner.open,
    (open) => {
      held.value = open ? !isDesktop.value : null
    },
    { immediate: true },
  )
  const fullscreen = computed(() => held.value ?? !isDesktop.value)
  /** Call straight from a tap: the browser grants fullscreen only to a gesture. */
  function startFromTap() {
    // A refusal leaves the Dialog, which already fills the viewport.
    if (fullscreen.value)
      document.documentElement.requestFullscreen?.().catch(() => {})
    scanner.start()
  }

  // Fullscreen belongs to the scanner, so it goes when the scanner does.
  watch(scanner.open, (open) => {
    if (!open && document.fullscreenElement)
      document.exitFullscreen().catch(() => {})
  })

  // The system's back gesture leaves fullscreen without the app asking, and the
  // camera light must go off with it.
  // Switching apps can end fullscreen a moment before the page reports hidden,
  // so the stop waits this long to tell Android's back gesture (still in view)
  // from leaving the app (hidden, which the scanner releases as interrupted).
  const APP_SWITCH_GRACE_MS = 250
  function stopUnlessLeavingTheApp() {
    if (scanner.open.value && document.visibilityState !== 'hidden')
      scanner.stop()
  }

  function onFullscreenChange() {
    if (scanner.open.value) {
      if (!document.fullscreenElement)
        setTimeout(stopUnlessLeavingTheApp, APP_SWITCH_GRACE_MS)
    } else if (document.fullscreenElement) {
      // A refused or missing camera settled before the request did.
      document.exitFullscreen().catch(() => {})
    }
    // Closed and out of fullscreen: the scanner's own exit, nothing to do.
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)
  onScopeDispose(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    // The surface is going, and its open-watch with it before it can fire.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  })

  return { fullscreen: readonly(fullscreen), startFromTap }
}
