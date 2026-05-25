// Reactive desktop-breakpoint indicator backed by window.matchMedia.
// Used to pick the right overlay shape (bottom drawer on phone, centred
// modal on desktop) instead of rendering both and hiding one with CSS,
// which would create duplicate focus traps and dialog roles.
//
// SSR-safe: defaults to phone (false) until mounted; Tucker is SPA-only so
// the initial render only flashes if the user is actually on desktop.
export function useIsDesktop(breakpointPx = 1024) {
  const isDesktop = ref(false)

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(`(min-width: ${breakpointPx}px)`)
    const update = () => {
      isDesktop.value = mql.matches
    }
    update()
    mql.addEventListener('change', update)
    onBeforeUnmount(() => mql.removeEventListener('change', update))
  })

  return isDesktop
}
