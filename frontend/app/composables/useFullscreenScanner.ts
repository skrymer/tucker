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
  const fullscreen = ref(!isDesktop.value)
  watchEffect(() => {
    if (!scanner.open.value) fullscreen.value = !isDesktop.value
  })
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
  function onFullscreenChange() {
    // Closed, the change is the scanner's own exit, not the system's.
    if (scanner.open.value && !document.fullscreenElement) scanner.stop()
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)
  onScopeDispose(() =>
    document.removeEventListener('fullscreenchange', onFullscreenChange),
  )

  return { fullscreen: readonly(fullscreen), startFromTap }
}
